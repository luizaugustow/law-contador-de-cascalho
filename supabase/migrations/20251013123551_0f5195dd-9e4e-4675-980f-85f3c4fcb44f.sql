-- Add type column to budgets table to support both income and expense budgets
ALTER TABLE public.budgets 
ADD COLUMN type text NOT NULL DEFAULT 'despesa' CHECK (type IN ('receita', 'despesa'));