-- Add destination_account_id column to transactions table
ALTER TABLE public.transactions 
ADD COLUMN destination_account_id uuid REFERENCES public.accounts(id);

-- Add check constraint to ensure transfers have destination account
ALTER TABLE public.transactions 
ADD CONSTRAINT check_transfer_destination 
CHECK (
  (type = 'transferencia' AND destination_account_id IS NOT NULL) OR
  (type != 'transferencia' AND destination_account_id IS NULL)
);