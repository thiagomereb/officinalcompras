import { Cabecalho } from '@/components/ui/Cabecalho'
import { UnidadesLogins } from '@/components/layout/UnidadesLogins'
import { createClient } from '@/lib/supabase/server'
import { definirUnidadeUsuario } from './actions'

const PLANEJADO = [
  { titulo: 'Avisos de vencimento', desc: 'Lembrete quando uma cotação estiver perto de vencer.' },
  { titulo: 'Criar logins', desc: 'Contas da equipe de compras. Hoje são criadas pelo painel do Supabase; a unidade de cada uma é definida aqui.' },
  { titulo: 'Exportação de dados', desc: 'Cotações e mapas em planilha.' },
]

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: logins } = await supabase.from('usuarios_unidade').select('user_id, email, unidade').order('email')

  return (
    <div className="pagina">
      <Cabecalho grupo="Sistema" titulo="Configurações" />

      <div className="grid max-w-3xl gap-5">
        <section className="painel">
          <div className="painel-topo">
            <div>
              <h2 className="painel-titulo">Unidade de cada login</h2>
              <p className="text-[12.5px] text-ardosia">
                Cada login vê e edita o código de produto da sua unidade (Goiânia ou Rio Verde). Login novo entra sem
                unidade e vê os dois até ela ser definida aqui.
              </p>
            </div>
          </div>
          <UnidadesLogins logins={logins ?? []} definir={definirUnidadeUsuario} />
        </section>

        <section className="painel">
          <div className="painel-topo">
            <div>
              <h2 className="painel-titulo">Ainda não configurável</h2>
              <p className="text-[12.5px] text-ardosia">Estes ajustes estão planejados. Enquanto isso, funcionam assim:</p>
            </div>
          </div>
          <ul>
            {PLANEJADO.map(({ titulo, desc }) => (
              <li key={titulo} className="flex items-start justify-between gap-4 border-b border-linha-2 px-5 py-3.5 last:border-0">
                <span>
                  <span className="block text-[13.5px] font-medium">{titulo}</span>
                  <span className="block text-[12.5px] text-ardosia">{desc}</span>
                </span>
                <span className="selo shrink-0">planejado</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
