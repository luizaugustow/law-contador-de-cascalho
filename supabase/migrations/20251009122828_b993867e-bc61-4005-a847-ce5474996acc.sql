-- Remove a restrição de tipo para permitir que categorias atendam receitas e despesas
-- A coluna 'type' será removida da tabela categories
ALTER TABLE public.categories DROP COLUMN IF EXISTS type;