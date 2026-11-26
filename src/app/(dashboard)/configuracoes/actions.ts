'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Falha } from '@/lib/acoes'
import { ehUnidadeFarmacia } from '@/lib/unidades-farmacia'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A unidade da farmácia de um login: decide qual código de produto ele vê
export async function definirUnidadeUsuario(userId: string, unidade: string | null): Promise<Falha | void> {
  if (!UUID.test(userId)) return { erro: 'Login inválido.' }
  if (unidade != null && !ehUnidadeFarmacia(unidade)) return { erro: 'Unidade inválida.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios_unidade')
    .update({ unidade, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) return { erro: error.message }
  // A unidade do login aparece em todas as telas (menu, códigos)
  revalidatePath('/', 'layout')
}
