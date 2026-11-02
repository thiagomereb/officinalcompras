import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const BUCKET = 'cotacoes'
const EXPIRES_IN = 60 * 60 // 1 hora

// O bucket "cotacoes" é privado — arquivos_url no banco guardam o path do
// objeto no storage, e o acesso é sempre via signed URL gerada sob demanda.
export async function getArquivoSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string | null
): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_IN)
  return data?.signedUrl ?? null
}

export async function getArquivosSignedUrls(
  supabase: SupabaseClient<Database>,
  paths: string[]
): Promise<Map<string, string>> {
  const unicos = [...new Set(paths)]
  if (!unicos.length) return new Map()

  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unicos, EXPIRES_IN)
  const map = new Map<string, string>()
  data?.forEach((d) => {
    if (d.signedUrl && d.path) map.set(d.path, d.signedUrl)
  })
  return map
}

// Remoção de melhor esforço: um arquivo órfão no storage não deve impedir a
// exclusão do registro que apontava para ele.
export async function removerArquivos(
  supabase: SupabaseClient<Database>,
  paths: (string | null)[]
): Promise<void> {
  const validos = paths.filter((p): p is string => !!p)
  if (!validos.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(validos)
  if (error) console.warn(`[storage] não foi possível remover ${validos.join(', ')}: ${error.message}`)
}
