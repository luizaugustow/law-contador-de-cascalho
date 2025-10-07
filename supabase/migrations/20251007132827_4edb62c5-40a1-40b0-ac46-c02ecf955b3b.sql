-- Tabela de categorias
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de subcategorias
CREATE TABLE public.subcategories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tipos de conta enum
CREATE TYPE account_type AS ENUM ('corrente', 'beneficio', 'investimento');

-- Tabela de contas
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  institution TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de transações
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies para categories
CREATE POLICY "Users can view their own categories" 
ON public.categories FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own categories" 
ON public.categories FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" 
ON public.categories FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" 
ON public.categories FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies para subcategories
CREATE POLICY "Users can view their own subcategories" 
ON public.subcategories FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subcategories" 
ON public.subcategories FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subcategories" 
ON public.subcategories FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subcategories" 
ON public.subcategories FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies para accounts
CREATE POLICY "Users can view their own accounts" 
ON public.accounts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own accounts" 
ON public.accounts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own accounts" 
ON public.accounts FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own accounts" 
ON public.accounts FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies para transactions
CREATE POLICY "Users can view their own transactions" 
ON public.transactions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transactions" 
ON public.transactions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" 
ON public.transactions FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions" 
ON public.transactions FOR DELETE 
USING (auth.uid() = user_id);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers para updated_at
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subcategories_updated_at
  BEFORE UPDATE ON public.subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();