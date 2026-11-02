// Preço na unidade base (R$/g, R$/mL, R$/un) lido como no visor de uma
// balança: o número em mono, moeda e unidade em tom menor ao redor.
export function LeituraPreco({
  valor,
  base,
  className = '',
}: {
  valor: number
  base: string | null
  className?: string
}) {
  // Preço por grama costuma ficar abaixo de R$1, onde 2 casas apagam a diferença
  const casas = Math.abs(valor) < 1 ? 4 : 2
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}>
      <span className="text-[11px] text-ardosia">R$</span>
      <span className="leitura">{numero}</span>
      {base && <span className="text-[11px] text-ardosia">/{base}</span>}
    </span>
  )
}
