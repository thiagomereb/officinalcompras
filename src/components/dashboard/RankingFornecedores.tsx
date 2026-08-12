export type RankingItem = {
  nome: string
  wins: number
  total: number
}

export function RankingFornecedores({ items }: { items: RankingItem[] }) {
  const max = Math.max(...items.map((i) => i.wins), 1)
  const medals = ['bg-amber-100 text-amber-700', 'bg-slate-200 text-slate-600', 'bg-orange-100 text-orange-700']

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-900 mb-0.5">Ranking de Fornecedores</h3>
      <p className="text-xs text-slate-400 mb-4">Por itens com melhor preço</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Cadastre cotações para ver o ranking.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.nome}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${medals[i] ?? 'bg-slate-100 text-slate-500'}`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-700 truncate">{item.nome}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{item.wins} itens</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${(item.wins / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
