// Número digitado num campo: "1.234,5", "1234,5", "1234.5" ou "1.000" (ponto de
// milhar, como se escreve em português); null quando vazio ou inválido
export function numeroDigitado(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const milhar = /^\d{1,3}(\.\d{3})+$/.test(t)
  const n = Number(t.includes(',') || milhar ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}
