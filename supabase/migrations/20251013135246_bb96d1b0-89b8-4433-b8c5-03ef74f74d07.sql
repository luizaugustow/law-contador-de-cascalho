-- Adicionar nova coluna income_amount
ALTER TABLE public.budgets 
  ADD COLUMN IF NOT EXISTS income_amount numeric NOT NULL DEFAULT 0;

-- Renomear amount para expense_amount
ALTER TABLE public.budgets 
  RENAME COLUMN amount TO expense_amount;

-- Remover coluna type
ALTER TABLE public.budgets 
  DROP COLUMN IF EXISTS type;