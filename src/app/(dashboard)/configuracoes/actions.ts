'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function salvarConfiguracao(chave: string, valor: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave, valor, updated_at: new Date().toISOString() }, { onConflict: 'chave' })

  if (error) throw new Error(error.message)
  revalidatePath('/configuracoes')
}
