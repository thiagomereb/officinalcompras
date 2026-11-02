import { Cabecalho } from '@/components/ui/Cabecalho'

const PLANEJADO = [
  {
    titulo: 'Pesos padrão dos mapas',
    desc: 'Hoje os pesos são escolhidos em cada mapa novo, a partir de 50 / 20 / 20 / 10.',
  },
  { titulo: 'Avisos de vencimento', desc: 'Lembrete quando uma cotação estiver perto de vencer.' },
  { titulo: 'Usuários e acessos', desc: 'Contas da equipe de compras. Hoje são criadas pelo painel do Supabase.' },
  { titulo: 'Exportação de dados', desc: 'Cotações e mapas em planilha.' },
]

export default function ConfiguracoesPage() {
  return (
    <div className="pagina">
      <Cabecalho grupo="Sistema" titulo="Configurações" />

      <section className="painel max-w-3xl">
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
  )
}
