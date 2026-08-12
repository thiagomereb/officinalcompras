-- Tabela mestre de insumos (com CAS Number para unificação de sinônimos)
create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  nome_padrao text not null,
  cas_number text unique,
  unidade_padrao text not null default 'g',
  descricao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sinônimos de insumos (ex: "Vitamina C" → insumo "Ácido Ascórbico")
create table public.insumo_sinonimos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  sinonimo text not null,
  created_at timestamptz default now(),
  unique(insumo_id, sinonimo)
);

-- Fornecedores
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique,
  email text,
  telefone text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cotações (cada upload de tabela de preços de um fornecedor)
create table public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  arquivo_nome text,
  arquivo_url text,
  data_cotacao date not null default current_date,
  validade_cotacao date,
  prazo_entrega_dias int,
  prazo_pagamento_dias int,
  pedido_minimo numeric(12,2),
  frete_fixo numeric(12,2),
  frete_gratis_acima numeric(12,2),
  status text not null default 'processando' check (status in ('processando', 'processado', 'erro')),
  erro_msg text,
  created_at timestamptz default now()
);

-- Itens de cada cotação
create table public.cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  insumo_id uuid references public.insumos(id),
  descricao_original text not null,
  unidade text,
  quantidade_minima numeric(12,4),
  preco_unitario numeric(12,4) not null,
  lote text,
  validade date,
  created_at timestamptz default now()
);

-- Mapa de cotação (resultado consolidado de uma rodada de cotações)
create table public.mapas_cotacao (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'exportado')),
  cotacoes_ids uuid[] not null default '{}',
  pdf_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Itens do mapa de cotação (insumo + melhor fornecedor selecionado)
create table public.mapa_cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  mapa_id uuid not null references public.mapas_cotacao(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  cotacao_item_id uuid references public.cotacao_itens(id),
  quantidade numeric(12,4) not null,
  justificativa text,
  created_at timestamptz default now()
);

-- Índices para performance
create index on public.insumo_sinonimos(insumo_id);
create index on public.insumo_sinonimos(lower(sinonimo));
create index on public.cotacao_itens(cotacao_id);
create index on public.cotacao_itens(insumo_id);
create index on public.cotacoes(fornecedor_id);
create index on public.cotacoes(data_cotacao);

-- RLS (Row Level Security) — habilitar em todas as tabelas
alter table public.insumos enable row level security;
alter table public.insumo_sinonimos enable row level security;
alter table public.fornecedores enable row level security;
alter table public.cotacoes enable row level security;
alter table public.cotacao_itens enable row level security;
alter table public.mapas_cotacao enable row level security;
alter table public.mapa_cotacao_itens enable row level security;

-- Políticas: usuários autenticados têm acesso total
create policy "Authenticated full access" on public.insumos for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.insumo_sinonimos for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.fornecedores for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.cotacoes for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.cotacao_itens for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.mapas_cotacao for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.mapa_cotacao_itens for all to authenticated using (true) with check (true);

-- Função para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.insumos for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.fornecedores for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mapas_cotacao for each row execute function public.set_updated_at();
