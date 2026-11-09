// Reconhece o fornecedor de um orçamento pelo CNPJ e pelo nome da empresa.
//
// O sistema da farmácia tem várias empresas do mesmo grupo com a mesma raiz de
// CNPJ (e até o mesmo CNPJ em dois cadastros); só o CNPJ não decide entre elas.
// O nome desempata: compara as palavras do nome de cada candidato com as do
// cabeçalho do orçamento, dando mais peso às palavras raras no cadastro
// ("PURIFARMA", "GALENA") que às comuns ("FARMACEUTICOS").

export type FornecedorCadastro = {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  codigo: string | null
  credenciado?: boolean | null
}

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
  // Siglas de estado: aparecem nos endereços do cabeçalho
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

// Palavra rara: aparece no nome de no máximo tantos cadastros ("GALENA", "FAGRON")
const RARA = 3

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

// raras: palavras raras do nome que aparecem inteiras no cabeçalho
type Pontuacao = { f: FornecedorCadastro; cobertura: number; peso: number; raras: number }

// Cobertura: quanto do nome do candidato (ponderado pela raridade de cada
// palavra no cadastro) aparece no cabeçalho do orçamento
function pontuar(candidatos: FornecedorCadastro[], cadastro: FornecedorCadastro[], cabecalho: Set<string>): Pontuacao[] {
  const df = new Map<string, number>()
  for (const f of cadastro) for (const p of palavras(nomesDe(f))) df.set(p, (df.get(p) ?? 0) + 1)
  const peso = (p: string) => Math.log((cadastro.length + 1) / ((df.get(p) ?? 0) + 1)) + 1

  // Abreviação do cadastro ("FARM.", "QUIM.") vale como a palavra inteira do orçamento
  const doCabecalho = [...cabecalho]
  const aparece = (p: string) => cabecalho.has(p) || (p.length >= 4 && doCabecalho.some((c) => c.startsWith(p)))

  return candidatos
    .map((f) => {
      const ps = palavras(nomesDe(f))
      const total = ps.reduce((s, p) => s + peso(p), 0)
      const achado = ps.filter(aparece).reduce((s, p) => s + peso(p), 0)
      const raras = ps.filter((p) => cabecalho.has(p) && (df.get(p) ?? 0) <= RARA).length
      return { f, cobertura: total ? achado / total : 0, peso: achado, raras }
    })
    // Empate de nome: o credenciado na farmácia vem primeiro
    .sort((a, b) => b.cobertura - a.cobertura || b.peso - a.peso || Number(!!b.f.credenciado) - Number(!!a.f.credenciado))
}

// Só escolhe pelo nome com folga sobre o segundo colocado
const COBERTURA_MINIMA = 0.75
const COBERTURA_SO_NOME = 0.85
const FOLGA = 0.15
const VANTAGEM_PESO = 1.3

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

  // Alternativas (mesma raiz de CNPJ) da mais parecida com o cabeçalho para a menos
  const alternativas = (excluir: string) =>
    pontuar(mesmaRaiz.filter((f) => f.id !== excluir), cadastro, cabecalho).map((p) => p.f)

  if (exatos.length === 1) {
    return { id: exatos[0].id, motivo: 'cnpj', alternativas: alternativas(exatos[0].id) }
  }

  // Várias empresas com o mesmo CNPJ ou a mesma raiz: o nome decide
  const grupo = exatos.length ? exatos : mesmaRaiz
  if (grupo.length === 1) return { id: grupo[0].id, motivo: 'cnpj', alternativas: [] }
  if (grupo.length > 1) {
    const [melhor] = pontuar(grupo, cadastro, cabecalho)
    // Empate de verdade (mesmo nome e CNPJ) também escolhe: o credenciado, ou o
    // primeiro, com os outros à vista para trocar
    const escolhido = melhor.cobertura >= COBERTURA_MINIMA ? melhor.f : null
    return {
      id: escolhido?.id ?? '',
      motivo: escolhido ? 'nome' : null,
      alternativas: alternativas(escolhido?.id ?? ''),
    }
  }

  // CNPJ fora do cadastro (ou sem CNPJ no orçamento): só pelo nome, com régua mais alta
  if (!cabecalho.size) return { id: '', motivo: null, alternativas: [] }
  const [melhor, ...resto] = pontuar(cadastro, cadastro, cabecalho)
  // Só pelo nome exige uma palavra rara batendo: palavra comum sozinha não decide
  if (!melhor || melhor.cobertura < COBERTURA_SO_NOME || melhor.raras === 0) return { id: '', motivo: null, alternativas: [] }
  // Cadastros com exatamente o mesmo nome são a mesma empresa registrada duas
  // vezes: não contam como concorrentes (fica o credenciado, os outros à vista)
  const nomeMelhor = palavras(nomesDe(melhor.f)).sort().join(' ')
  const mesmoNome = resto.filter((p) => palavras(nomesDe(p.f)).sort().join(' ') === nomeMelhor)
  const concorrente = resto.find((p) => !mesmoNome.includes(p))
  // Ganha com folga na cobertura ou batendo bem mais (uma palavra rara a mais,
  // como a marca: "FAGRON - SM EMPREENDIMENTOS" contra "SM EMPREENDIMENTOS")
  const folgado =
    !concorrente ||
    melhor.cobertura - concorrente.cobertura >= FOLGA ||
    melhor.peso >= concorrente.peso * VANTAGEM_PESO
  if (!folgado) return { id: '', motivo: null, alternativas: [] }
  return { id: melhor.f.id, motivo: 'nome', alternativas: mesmoNome.map((p) => p.f) }
}
