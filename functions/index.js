import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import nodemailer from 'nodemailer'

initializeApp()
const db = getFirestore()

// SMTP-instellingen. De niet-geheime waarden staan in functions/.env, het
// wachtwoord in Secret Manager:  firebase functions:secrets:set SMTP_PASSWORD
const SMTP_HOST = defineString('SMTP_HOST')
const SMTP_PORT = defineString('SMTP_PORT', { default: '587' })
const SMTP_USER = defineString('SMTP_USER')
const MAIL_FROM = defineString('MAIL_FROM')
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD')

function escapeHtml(tekst) {
  return String(tekst).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Testfase (instellingen/algemeen: { testfase, testEmail }): alle mail gaat dan
// alleen naar het testadres, met "[TEST]" in het onderwerp en bovenaan de
// ontvangers die de mail normaal had gekregen. Zo kan er tijdens het testen
// nooit per ongeluk iets naar een klant of leverancier.
async function testfaseInstelling() {
  const snap = await db.doc('instellingen/algemeen').get()
  const data = snap.data() || {}
  const adres = String(data.testEmail || '').trim()
  return data.testfase && adres ? adres : null
}

function naarTestadres(mail, testEmail) {
  const lijst = (v) => (Array.isArray(v) ? v : v ? [v] : []).join(', ')
  const oorspronkelijk = [
    `Aan: ${lijst(mail.to) || '-'}`,
    mail.cc && lijst(mail.cc) ? `Cc: ${lijst(mail.cc)}` : '',
    mail.bcc && lijst(mail.bcc) ? `Bcc: ${lijst(mail.bcc)}` : '',
  ].filter(Boolean)
  const kop = [`TESTFASE - deze mail is niet naar de ontvangers gestuurd, alleen naar ${testEmail}.`, ...oorspronkelijk]
  const { subject = '', text = '', html = '', attachments = [] } = mail.message || {}
  return {
    to: [testEmail],
    cc: [],
    bcc: [],
    replyTo: mail.replyTo,
    subject: `[TEST] ${subject}`,
    text: `${kop.join('\n')}\n\n${text}`,
    html:
      '<div style="border:2px solid #c0392b;padding:8px 12px;margin-bottom:16px;' +
      'font-family:Arial,sans-serif;font-size:11pt;color:#c0392b">' +
      `${kop.map(escapeHtml).join('<br>')}</div>${html}`,
    attachments,
    oorspronkelijk,
  }
}

// Verstuurt elk nieuw document in `mail` (zelfde formaat als de vroegere
// Trigger Email-extensie: { to, message: { subject, text, html, attachments } })
// en schrijft het resultaat terug in `delivery`, zodat de app de status kan tonen.
export const verstuurMail = onDocumentCreated(
  { document: 'mail/{mailId}', region: 'europe-west1', secrets: [SMTP_PASSWORD] },
  async (event) => {
    const ref = event.data?.ref
    if (!ref) return

    // Claim het document in een transactie, zodat een dubbele aanroep van de
    // trigger nooit tot een dubbele mail leidt.
    const mail = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const data = snap.data()
      if (!data || data.delivery) return null
      tx.update(ref, {
        delivery: { state: 'PROCESSING', startTime: FieldValue.serverTimestamp(), attempts: 1 },
      })
      return data
    })
    if (!mail) return

    try {
      const port = Number(SMTP_PORT.value())
      const transport = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port,
        secure: port === 465,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASSWORD.value() },
      })

      const testEmail = await testfaseInstelling()
      const { subject, text, html, attachments = [] } = mail.message || {}
      const bericht = testEmail
        ? naarTestadres(mail, testEmail)
        : { to: mail.to, cc: mail.cc, bcc: mail.bcc, replyTo: mail.replyTo, subject, text, html, attachments }
      const info = await transport.sendMail({
        from: MAIL_FROM.value(),
        to: bericht.to,
        cc: bericht.cc,
        bcc: bericht.bcc,
        replyTo: bericht.replyTo,
        subject: bericht.subject,
        text: bericht.text,
        html: bericht.html,
        attachments: bericht.attachments,
      })

      await ref.update({
        delivery: {
          state: 'SUCCESS',
          endTime: FieldValue.serverTimestamp(),
          messageId: info.messageId || null,
          accepted: info.accepted || [],
          rejected: info.rejected || [],
          ...(testEmail ? { testfase: true, testEmail, oorspronkelijk: bericht.oorspronkelijk } : {}),
        },
      })
      logger.info('Mail verstuurd', { mailId: ref.id, to: bericht.to, testfase: !!testEmail })
    } catch (err) {
      logger.error('Mail versturen mislukt', { mailId: ref.id, error: err.message })
      await ref.update({
        delivery: { state: 'ERROR', endTime: FieldValue.serverTimestamp(), error: err.message },
      })
    }
  }
)
