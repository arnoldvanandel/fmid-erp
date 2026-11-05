// Windows-pad uit Axapta, zoals H:\Drawing\Axapta\A106 12-15.pdf.
// De dev-server leest het bestand; een file:-link vanaf de site doet niets.

export function tekeningHref(pad) {
  return `/axapta-tekening?pad=${encodeURIComponent(pad || '')}`
}
