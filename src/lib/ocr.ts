export type ItemExtraido = {
  descricao: string
  preco_unitario: number
  quantidade_embalagem: number | null
  quantidade: number | null
  unidade: string | null
  pais_origem: string | null
  ipi: number | null
  st: number | null
  validade: string | null
  cas: string | null
}

// O que uma Server Action devolve ao navegador para ele conduzir a extração.
// Planilhas já vêm processadas ("concluido"); imagens/PDF exigem a chamada de
// OCR, que o navegador faz direto na Edge Function (ver ocr-browser.ts).
export type PreparoExtracao =
  | { modo: 'concluido'; count: number }
  | { modo: 'ocr'; signedUrl: string; arquivoNome: string }
