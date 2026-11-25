// As unidades da farmácia, como o relatório da cotação própria as escreve
// ("FARMACIA OFFICINAL [MARISTA]", "FARMACIA OFFICINAL (RV) - UNIDADE 1 (BARRINHA)").
// O código do produto é de cada unidade (tabela insumo_codigos): o mesmo número
// pode ser um produto numa e outro na outra.

// A chave da unidade: a mesma regra da função chave_unidade do banco
export function chaveUnidade(unidade: string | null | undefined): string {
  return (unidade ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

// Nome curto para mostrar: o que está entre colchetes ou nos últimos parênteses
export function nomeCurtoUnidade(unidade: string | null | undefined): string {
  const u = (unidade ?? '').trim()
  if (!u) return 'sem unidade'
  const nome = /\[([^\]]+)\]/.exec(u)?.[1] ?? /\(([^()]+)\)\s*$/.exec(u)?.[1] ?? u
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()
}
