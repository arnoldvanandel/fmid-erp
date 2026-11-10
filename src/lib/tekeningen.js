// Tekening uit Axapta, zoals H:\Drawing\Axapta\A106 12-15.pdf.
// Online staat er een kopie in Cloud Storage (`url`, zie
// scripts/upload-tekeningen.mjs). Zonder url leest alleen de dev-server het
// bestand van de schijf; een file:-link vanaf de site doet niets.

export function tekeningHref(tekening) {
  if (tekening?.url) return tekening.url
  return `/axapta-tekening?pad=${encodeURIComponent(tekening?.pad || '')}`
}
