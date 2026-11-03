export type RankingItem = {
  nome: string
  wins: number
  total: number
}

// Contagem de sugestões, não de compras: a decisão é do comprador (ver
// Histórico de compras para o que foi de fato comprado)
export function RankingFornecedores({ items }: { items: RankingItem[] }) {
  const max = Math.max(...items.map((i) => i.wins), 1)

  return (
    <section className="painel">
      <div className="painel-topo">
        <div>
          <h2 className="painel-titulo">Sugestões do sistema por fornecedor</h2>
          <p className="text-[12.5px] text-ardosia">Insumos em que cada um tem o melhor score nas cotações vigentes</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] text-ardosia">Lance cotações para ver o ranking.</p>
      ) : (
        <ol className="space-y-4 px-5 py-5">
          {items.map((item, i) => (
            <li key={item.nome}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] font-medium">{item.nome}</span>
                <span className="leitura shrink-0 text-[12.5px] text-ardosia">
                  {item.wins}
                  <span className="text-ardosia-2">/{item.total}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-nevoa">
                <div
                  className={`h-full rounded-full ${i === 0 ? 'bg-grafite' : 'bg-grafite/45'}`}
                  style={{ width: `${(item.wins / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
