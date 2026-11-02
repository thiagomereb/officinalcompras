import { createClient } from './client'

const BUCKET = 'cotacoes'

// file_size_limit do bucket (migration storage_bucket)
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024

const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
}

export const ACCEPT_ARQUIVO_COTACAO = Object.keys(MIME_POR_EXTENSAO).map((e) => `.${e}`).join(',')

export function extensaoDe(nome: string): string {
  return nome.split('.').pop()?.toLowerCase() ?? ''
}

// O upload vai direto do navegador para o Storage. Passar o arquivo por uma
// Server Action esbarrava no limite de 1 MB do corpo (e no de 6 MB das Netlify
// Functions), o que derrubava fotos de celular e PDFs. O path segue o formato
// que as actions validam (PATH_ARQUIVO em cotacoes/actions.ts).
export async function enviarArquivoCotacao(arquivo: Blob, nome: string, pasta?: string): Promise<string> {
  const ext = extensaoDe(nome)
  const contentType = MIME_POR_EXTENSAO[ext]
  if (!contentType) {
    throw new Error(`Formato "${ext}" não suportado. Envie uma imagem (JPEG, PNG ou WebP), PDF ou planilha (XLSX/XLS).`)
  }
  if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1)
    throw new Error(`Arquivo muito grande (${mb} MB). O limite é ${LIMITE_ARQUIVO_BYTES / 1024 / 1024} MB.`)
  }

  const nomeObjeto = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const path = pasta ? `${pasta}/${nomeObjeto}` : nomeObjeto

  const supabase = createClient()
  // contentType explícito: alguns navegadores mandam .xls sem tipo, e o bucket
  // recusa o que não estiver em allowed_mime_types
  const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType })
  if (error) throw new Error(`Erro no upload: ${error.message}`)
  return path
}

// Desfaz um upload cujo registro no banco não chegou a ser criado
export async function removerArquivoCotacao(path: string): Promise<void> {
  await createClient().storage.from(BUCKET).remove([path])
}
