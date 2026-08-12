CREATE TABLE IF NOT EXISTS public.api_usage_limits (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  chave      text        NOT NULL DEFAULT 'global',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS api_usage_limits_chave_created_at_idx
  ON public.api_usage_limits (chave, created_at);

-- Service role acessa sem RLS
ALTER TABLE public.api_usage_limits ENABLE ROW LEVEL SECURITY;
