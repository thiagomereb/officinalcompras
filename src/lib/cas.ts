// Número CAS: até 7 dígitos, hífen, 2 dígitos, hífen e um dígito verificador
// (ex.: 50-81-7). Planilhas de fornecedor costumam trazer só os dígitos, com
// zeros à esquerda ("0000050817").

const SO_DIGITOS = /^\d{5,10}$/
const COM_HIFENS = /^(\d{2,10})-(\d{2})-(\d)$/
const LIMITE = 100

// Soma dos dígitos (sem o verificador), da direita para a esquerda, cada um
// multiplicado pela posição; o verificador é o resto por 10
function digitoVerificador(corpo: string): number {
  return [...corpo].reverse().reduce((soma, d, i) => soma + Number(d) * (i + 1), 0) % 10
}

export type CasNormalizado = { ok: true; cas: string | null } | { ok: false; erro: string }

// Aceita o CAS com ou sem hífens e devolve no formato padrão. Texto que não
// tem cara de CAS (ex.: "N/A", uma mistura com dois números) fica como veio.
export function normalizarCas(entrada: string | null | undefined): CasNormalizado {
  const texto = (entrada ?? '').trim().replace(/\s+/g, ' ')
  if (!texto) return { ok: true, cas: null }
  if (texto.length > LIMITE) return { ok: false, erro: `O CAS passa de ${LIMITE} caracteres.` }

  const compacto = texto.replace(/\s/g, '')
  const hifens = COM_HIFENS.exec(compacto)
  const brutos = SO_DIGITOS.test(compacto) ? compacto : hifens ? hifens[1] + hifens[2] + hifens[3] : null
  if (brutos == null) return { ok: true, cas: texto }

  const digitos = brutos.replace(/^0+/, '')
  if (digitos.length < 5) return { ok: false, erro: 'O CAS tem pelo menos 5 dígitos (ex.: 50-81-7).' }

  const corpo = digitos.slice(0, -1)
  const verificador = Number(digitos.slice(-1))
  const cas = `${corpo.slice(0, -2)}-${corpo.slice(-2)}-${verificador}`
  const esperado = digitoVerificador(corpo)
  if (esperado !== verificador) {
    return {
      ok: false,
      erro: `Dígito verificador não confere: para ${corpo.slice(0, -2)}-${corpo.slice(-2)}, o último número seria ${esperado}.`,
    }
  }
  return { ok: true, cas }
}

// Para exibir e para o que vem da extração, onde não dá para perguntar:
// formata quando é um CAS válido, senão devolve o texto como veio
export function formatarCas(texto: string | null | undefined): string | null {
  const r = normalizarCas(texto)
  return r.ok ? r.cas : texto?.trim() || null
}
