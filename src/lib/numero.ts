// Número digitado num campo: "1.234,5", "1234,5" ou "1234.5"; null quando
// vazio ou inválido
export function numeroDigitado(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}
