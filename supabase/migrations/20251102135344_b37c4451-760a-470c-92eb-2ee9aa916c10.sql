-- Remove the separate expense and income amount columns
ALTER TABLE public.budgets DROP COLUMN IF EXISTS expense_amount;
ALTER TABLE public.budgets DROP COLUMN IF EXISTS income_amount;

-- Add a single amount column for consolidated budget
ALTER TABLE public.budgets ADD COLUMN amount NUMERIC NOT NULL DEFAULT 0;