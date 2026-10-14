// Staffelprijzen voor inkoop.
//
// Een artikel kan een inkoopstaffel hebben: regels met "t/m hoeveelheid" en
// een prijs. De prijs geldt per eenheid (bijv. € 2,10 per kg vanaf 100 kg) of
// als vast bedrag per zending (bijv. € 375,72 voor 45,1–50 kg). Boven de
// hoogste staffelregel geldt weer de gewone inkoopprijs van het artikel.

export const STAFFEL_SOORTEN = {
  eenheid: 'Prijs per eenheid',
  zending: 'Vast bedrag per zending',
}

// Staffelregels opgeschoond en oplopend gesorteerd op "t/m hoeveelheid".
export function staffelRegels(staffel) {
  return (staffel?.regels || [])
    .map((r) => ({ tot: Number(r.tot), prijs: Number(r.prijs) }))
    .filter((r) => r.tot > 0 && r.prijs >= 0 && !Number.isNaN(r.prijs))
    .sort((a, b) => a.tot - b.tot)
}

// Prijs per eenheid voor een inkooporderregel. Gebruikt de staffel als de
// hoeveelheid erin valt, anders de gewone inkoopprijs (die geldt per
// inkoopprijsHoeveelheid, bijv. per 100 stuks). Afgerond op 4 decimalen.
export function inkoopprijsPerEenheid(artikel, aantal) {
  const n = Number(aantal) || 0
  const regel = n > 0 ? staffelRegels(artikel?.inkoopStaffel).find((r) => n <= r.tot) : null
  let prijs
  if (regel) {
    prijs = artikel.inkoopStaffel.soort === 'zending' ? regel.prijs / n : regel.prijs
  } else {
    prijs = (Number(artikel?.inkoopprijs) || 0) / (Number(artikel?.inkoopprijsHoeveelheid) || 1)
  }
  return Math.round(prijs * 10000) / 10000
}
