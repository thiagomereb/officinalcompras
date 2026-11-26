import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ehUnidadeFarmacia, type UnidadeFarmacia } from './unidades-farmacia'

// A unidade da farmácia do login atual (usuarios_unidade); null quando o login
// ainda não tem unidade definida (vê os códigos das duas)
export async function unidadeDoLogin(supabase: SupabaseClient<Database>): Promise<UnidadeFarmacia | null> {
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return null
  const { data: linha } = await supabase.from('usuarios_unidade').select('unidade').eq('user_id', userId).maybeSingle()
  return ehUnidadeFarmacia(linha?.unidade) ? linha.unidade : null
}
