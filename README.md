# Officinal Compras

Sistema interno de cotação de insumos para a farmácia de manipulação. Recebe as tabelas de preço dos fornecedores (planilha, PDF ou foto), extrai os itens, vincula cada um à tabela mestre de insumos e gera mapas de comparação com um score ponderado por preço, prazo de entrega, prazo de pagamento e frete.

## Stack

- **Next.js 16** (App Router, Server Actions). Esta versão muda APIs em relação às anteriores; consulte `node_modules/next/dist/docs/` antes de mexer (ver `AGENTS.md`).
- **Supabase**: Postgres com RLS, Auth, Storage (bucket privado `cotacoes`) e a Edge Function `ocr-extrair`.
- **Gemini** para o OCR das imagens, chamado pela Edge Function.
- Deploy na **Netlify** (`netlify.toml`).

## Rodando localmente

```bash
npm install        # também copia o worker do pdfjs para public/
npm run dev
```

Crie um `.env.local` com:

```
NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# Só para os scripts de importação (nunca no app):
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Outros comandos: `npm run build`, `npm run lint`, `npm test`.

## Banco e Edge Function

As migrations ficam em `supabase/migrations/` e precisam ser aplicadas antes do deploy do app que depende delas:

```bash
npx supabase db push
npx supabase functions deploy ocr-extrair
npx supabase secrets set GEMINI_API_KEY=<chave>
```

O acesso é só para usuários autenticados. **Deixe o cadastro público desligado** no painel do Supabase (Authentication → Sign In / Providers → "Allow new users to sign up"): as policies liberam tudo para qualquer usuário logado, então quem conseguir criar uma conta tem acesso total.

## Como o fluxo funciona

1. **Cotação**: o arquivo sobe direto do navegador para o Storage (`lib/supabase/upload.ts`). Passar pelo servidor esbarraria no limite de 1 MB das Server Actions.
2. **Extração**:
   - Planilhas são lidas no servidor (`lib/excel.ts`).
   - Imagens vão do navegador para a Edge Function de OCR (`lib/ocr-browser.ts`). Isso evita o limite de 60 s das Netlify Functions.
   - PDFs são convertidos em imagens no navegador, uma por página.
   - Extrair de novo o mesmo arquivo substitui os itens em vez de duplicá-los.
3. **Vínculo**: cada item é ligado ao insumo mais parecido (nome ou sinônimo, via `pg_trgm`) pela função `vincular_itens_cotacao`, a partir de 60% de semelhança. O que não passar fica para vínculo manual. Vínculos errados são corrigidos na própria tabela da cotação, e cada correção (ou vínculo manual) pode virar sinônimo do insumo, para a próxima cotação já entrar certa.
4. **Mapa**: `lib/comparacao.ts` pontua os fornecedores **dentro de cada insumo**. O preço é comparado na unidade base (R$/g, R$/mL), então embalagens de tamanhos e unidades diferentes ficam comparáveis. O score é **só uma sugestão**: o comprador escolhe a oferta de cada insumo, informa a quantidade (mg, g, kg, mL, L ou kL) e aprova.
5. **Histórico de compras**: a aprovação (função `aprovar_mapa`) congela a decisão — cópia da oferta escolhida, quantidade, valor, a comparação inteira, quem aprovou e quando. Mapa aprovado não muda nem pode ser excluído (travas no banco); só cancelado, com motivo. A tela `/compras` lista tudo que foi aprovado.
6. **PDF**: mapas e cotações saem em PDF pelo botão "Baixar PDF" (`/mapas/[id]/pdf` e `/cotacoes/[id]/pdf`), gerados no servidor com `@react-pdf/renderer` (`components/pdf/`). O mapa aprovado sai da cópia congelada.

## Importação da tabela GYN

```bash
node scripts/import-insumos-gyn.mjs caminho/SinonimosGYN_tabela_completa.xlsx
```
