-- Criar tabela de relacionamento many-to-many entre transações e tags
CREATE TABLE public.transaction_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, tag_id)
);

-- Habilitar RLS
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuário pode ver tags de suas próprias transações
CREATE POLICY "Users can view their transaction tags"
ON public.transaction_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE transactions.id = transaction_tags.transaction_id
    AND transactions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their transaction tags"
ON public.transaction_tags
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE transactions.id = transaction_tags.transaction_id
    AND transactions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their transaction tags"
ON public.transaction_tags
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE transactions.id = transaction_tags.transaction_id
    AND transactions.user_id = auth.uid()
  )
);

-- Remover coluna tag_id da tabela transactions (não é mais necessária)
ALTER TABLE public.transactions DROP COLUMN IF EXISTS tag_id;