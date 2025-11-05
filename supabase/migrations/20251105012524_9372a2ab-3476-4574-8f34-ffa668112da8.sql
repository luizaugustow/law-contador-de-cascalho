
-- Drop the old type check constraint
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add new type check constraint including 'transferencia'
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check CHECK (
  type = ANY (ARRAY['receita'::text, 'despesa'::text, 'transferencia'::text])
);
