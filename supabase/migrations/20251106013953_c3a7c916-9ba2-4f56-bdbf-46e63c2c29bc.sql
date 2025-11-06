-- Add transfer_pair_id to link transfer transactions
ALTER TABLE public.transactions 
ADD COLUMN transfer_pair_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE;