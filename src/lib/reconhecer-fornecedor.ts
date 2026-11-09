// Reconhece o fornecedor de um orçamento pelo CNPJ e pelo nome da empresa.
//
// O sistema da farmácia tem várias empresas do mesmo grupo com a mesma raiz de
// CNPJ (e até o mesmo CNPJ em dois cadastros); só o CNPJ não decide entre elas.
// O nome desempata: compara as palavras do nome de cada candidato com as do
// cabeçalho do orçamento, dando mais peso às palavras raras no cadastro
// ("PURIFARMA", "GALENA") que às comuns ("FARMACEUTICOS").

export type FornecedorCadastro = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; codigo: string | null }

export type Reconhecimento = {
  id: string
  motivo: 'cnpj' | 'nome' | null
  // Outras empresas com o mesmo CNPJ (ou raiz), para o comprador trocar se precisar
  alternativas: FornecedorCadastro[]
}

// Palavras de forma jurídica e ligação: não identificam ninguém
const IGNORAR = new Set([
  'LTDA', 'EIRELI', 'ME', 'EPP', 'SA', 'S', 'A', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'PARA', 'P',
  'COM', 'IND', 'IMP', 'EXP', 'CIA', 'THE', 'AND',
])

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function palavras(texto: string): string[] {
  return [
    ...new Set(
      texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .split(' ')
        .filter((p) => p.length > 1 && !/^\d+$/.test(p) && !IGNORAR.has(p)),
    ),
  ]
}

const nomesDe = (f: FornecedorCadastro) => `${f.razao_social} ${f.nome_fantasia ?? ''}`

type Pontuacao = { f: FornecedorCadastro; cobertura: number; peso: number }

// Cobertura: quanto do nome do candidato (ponderado pela raridade de cada
// palavra no cadastro) aparece no cabeçalho do orçamento
function pontuar(candidatos: FornecedorCadastro[], cadastro: FornecedorCadastro[], cabecalho: Set<string>): Pontuacao[] {
  const df = new Map<string, number>()
  for (const f of cadastro) for (const p of palavras(nomesDe(f))) df.set(p, (df.get(p) ?? 0) + 1)
  const peso = (p: string) => Math.log((cadastro.length + 1) / ((df.get(p) ?? 0) + 1)) + 1

  return candidatos
    .map((f) => {
      const ps = palavras(nomesDe(f))
      const total = ps.reduce((s, p) => s + peso(p), 0)
      const achado = ps.filter((p) => cabecalho.has(p)).reduce((s, p) => s + peso(p), 0)
      return { f, cobertura: total ? achado / total : 0, peso: achado }
    })
    .sort((a, b) => b.cobertura - a.cobertura || b.peso - a.peso)
}

// Só escolhe pelo nome com folga sobre o segundo colocado
const COBERTURA_MINIMA = 0.75
const COBERTURA_SO_NOME = 0.85
const FOLGA = 0.15

export function reconhecerFornecedor(
  cadastro: FornecedorCadastro[],
  cnpj: string | null,
  // Nome(s) do fornecedor e o texto do cabeçalho do orçamento
  textoCabecalho: string,
): Reconhecimento {
  const cabecalho = new Set(palavras(textoCabecalho))
  const digitos = soDigitos(cnpj)

  const exatos = digitos.length === 14 ? cadastro.filter((f) => soDigitos(f.cnpj) === digitos) : []
  const mesmaRaiz =
    digitos.length >= 8 ? cadastro.filter((f) => soDigitos(f.cnpj).length >= 8 && soDigitos(f.cnpj).slice(0, 8) === digitos.slice(0, 8)) : []

  if (exatos.length === 1) {
    return { id: exatos[0].id, motivo: 'cnpj', alternativas: mesmaRaiz.filter((f) => f.id !== exatos[0].id) }
  }

  // Várias empresas com o mesmo CNPJ ou a mesma raiz: o nome decide
  const grupo = exatos.length ? exatos : mesmaRaiz
  if (grupo.length === 1) return { id: grupo[0].id, motivo: 'cnpj', alternativas: [] }
  if (grupo.length > 1) {
    const [melhor, segundo] = pontuar(grupo, cadastro, cabecalho)
    const decide =
      melhor.cobertura >= COBERTURA_MINIMA &&
      (!segundo || melhor.cobertura - segundo.cobertura >= FOLGA || melhor.peso > segundo.peso)
    // Empate de verdade (mesmo nome e CNPJ): fica o primeiro, com os outros à vista
    const escolhido = decide || melhor.cobertura >= COBERTURA_MINIMA ? melhor.f : null
    return {
      id: escolhido?.id ?? '',
      motivo: escolhido ? 'nome' : null,
      alternativas: grupo.filter((f) => f.id !== escolhido?.id),
    }
  }

  // CNPJ fora do cadastro (ou sem CNPJ no orçamento): só pelo nome, com régua mais alta
  if (!cabecalho.size) return { id: '', motivo: null, alternativas: [] }
  const [melhor, segundo] = pontuar(cadastro, cadastro, cabecalho)
  if (
    melhor &&
    melhor.cobertura >= COBERTURA_SO_NOME &&
    (!segundo || melhor.cobertura - segundo.cobertura >= FOLGA)
  ) {
    return { id: melhor.f.id, motivo: 'nome', alternativas: [] }
  }
  return { id: '', motivo: null, alternativas: [] }
}
