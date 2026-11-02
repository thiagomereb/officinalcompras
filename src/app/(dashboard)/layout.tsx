import { Sidebar } from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

type Metadados = { full_name?: unknown; name?: unknown }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  // getClaims valida o token localmente (chave ES256 em cache), sem ida ao
  // servidor de Auth; o middleware já garantiu que há sessão.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const metadados = (claims?.user_metadata ?? {}) as Metadados
  const nome = [metadados.full_name, metadados.name].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar usuario={{ nome: nome?.trim() ?? null, email: claims?.email ?? '' }} />
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  )
}
