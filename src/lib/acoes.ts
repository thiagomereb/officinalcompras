// Em produção o Next troca a mensagem de qualquer erro lançado por uma Server
// Action por um texto genérico (para não vazar detalhes do servidor). Erros que
// o usuário precisa ler — validação, registro em uso, falha de upload — voltam
// então como valor, e o client mostra `erro`.
export type Falha = { erro: string }

export function ehFalha(v: unknown): v is Falha {
  return typeof v === 'object' && v !== null && typeof (v as Falha).erro === 'string'
}

const FK_VIOLADA = '23503'
const UNICO_VIOLADO = '23505'

export function mensagemErroBanco(
  error: { code?: string; message: string },
  mensagens: { emUso?: string; duplicado?: string } = {},
): string {
  if (error.code === FK_VIOLADA && mensagens.emUso) return mensagens.emUso
  if (error.code === UNICO_VIOLADO && mensagens.duplicado) return mensagens.duplicado
  return error.message
}
