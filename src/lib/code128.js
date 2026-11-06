// Code 128, subset B. Zelfde symbologie als het Excel-blad `barcode` (font Code 128).
// Patronen: waarde 0 t/m 105, daarna stop (106). Elke code is 11 modules, stop is 13.

const PATROON = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

// Modules van een Code 128-B symbool: { bar, w } met stille zone aan beide kanten.
export function code128Modules(tekst) {
  const waarde = String(tekst ?? '')
  if (!waarde) return []
  const codes = [START_B]
  for (const ch of waarde) {
    const v = ch.charCodeAt(0) - 32
    if (v < 0 || v > 95) throw new Error(`Teken niet in Code 128-B: ${ch}`)
    codes.push(v)
  }
  let som = codes[0]
  for (let i = 1; i < codes.length; i++) som += codes[i] * i
  codes.push(som % 103)
  codes.push(STOP)

  const modules = []
  for (let q = 0; q < 10; q++) modules.push({ bar: false, w: 1 })
  for (const code of codes) {
    const patroon = PATROON[code]
    for (let i = 0; i < patroon.length; i++) modules.push({ bar: i % 2 === 0, w: Number(patroon[i]) })
  }
  for (let q = 0; q < 10; q++) modules.push({ bar: false, w: 1 })
  return modules
}
