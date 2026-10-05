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

      const { subject, text, html, attachments = [] } = mail.message || {}
      const info = await transport.sendMail({
        from: MAIL_FROM.value(),
        to: mail.to,
        cc: mail.cc,
        bcc: mail.bcc,
        replyTo: mail.replyTo,
        subject,
        text,
        html,
        attachments,
      })

      await ref.update({
        delivery: {
          state: 'SUCCESS',
          endTime: FieldValue.serverTimestamp(),
          messageId: info.messageId || null,
          accepted: info.accepted || [],
          rejected: info.rejected || [],
        },
      })
      logger.info('Mail verstuurd', { mailId: ref.id, to: mail.to })
    } catch (err) {
      logger.error('Mail versturen mislukt', { mailId: ref.id, error: err.message })
      await ref.update({
        delivery: { state: 'ERROR', endTime: FieldValue.serverTimestamp(), error: err.message },
      })
    }
  }
)
