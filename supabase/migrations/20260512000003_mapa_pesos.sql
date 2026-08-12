alter table public.mapas_cotacao
  add column if not exists pesos jsonb default '{"preco":50,"entrega":20,"pagamento":20,"frete":10}'::jsonb;
