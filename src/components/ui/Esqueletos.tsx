// Esqueletos dos loading.tsx. Com eles a navegação troca de tela no clique
// (o Next pré-carrega o esqueleto) em vez de esperar o servidor terminar a
// página inteira com a tela antiga parada.

// Larguras fixas, mas variadas, para as linhas não parecerem um bloco só
const LARGURAS = [
  ['42%', '24%', '14%'],
  ['36%', '30%', '10%'],
  ['48%', '20%', '16%'],
  ['30%', '26%', '12%'],
  ['44%', '18%', '14%'],
  ['38%', '28%', '10%'],
]

function Linhas({ quantidade }: { quantidade: number }) {
  return (
    <div>
      {Array.from({ length: quantidade }, (_, i) => {
        const [a, b, c] = LARGURAS[i % LARGURAS.length]
        return (
          <div key={i} className="flex items-center gap-6 border-b border-linha-2 px-4 py-[15px] last:border-0">
            <div className="esqueleto h-3" style={{ width: a }} />
            <div className="esqueleto h-3" style={{ width: b }} />
            <div className="esqueleto ml-auto h-3" style={{ width: c }} />
          </div>
        )
      })}
    </div>
  )
}

function Topo() {
  return (
    <div className="mb-6">
      <div className="esqueleto mb-3 h-2.5 w-20" />
      <div className="esqueleto h-7 w-56 max-w-full" />
    </div>
  )
}

export function EsqueletoLista({ linhas = 8, indicadores = false }: { linhas?: number; indicadores?: boolean }) {
  return (
    <div className="pagina" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <Topo />
      {indicadores && (
        <div className="painel mb-5 grid grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-linha-2 p-5 [&:not(:last-child)]:border-r">
              <div className="esqueleto mb-3 h-2.5 w-24" />
              <div className="esqueleto h-6 w-16" />
            </div>
          ))}
        </div>
      )}
      <div className="painel">
        <div className="painel-topo">
          <div className="esqueleto h-3.5 w-36" />
          <div className="esqueleto h-8 w-52 max-w-full" />
        </div>
        <Linhas quantidade={linhas} />
      </div>
    </div>
  )
}

export function EsqueletoDetalhe() {
  return (
    <div className="pagina" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="esqueleto mb-4 h-3 w-32" />
      <Topo />
      <div className="painel mb-6 p-5">
        <div className="esqueleto h-3.5 w-48" />
      </div>
      <div className="painel">
        <div className="painel-topo">
          <div className="esqueleto h-3.5 w-28" />
          <div className="flex gap-2">
            <div className="esqueleto h-8 w-28" />
            <div className="esqueleto h-8 w-32" />
          </div>
        </div>
        <Linhas quantidade={7} />
      </div>
    </div>
  )
}

export function EsqueletoFormulario() {
  return (
    <div className="pagina" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="esqueleto mb-4 h-3 w-32" />
      <Topo />
      <div className="painel max-w-3xl space-y-6 p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <div className="esqueleto mb-2.5 h-2.5 w-28" />
            <div className="esqueleto h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
