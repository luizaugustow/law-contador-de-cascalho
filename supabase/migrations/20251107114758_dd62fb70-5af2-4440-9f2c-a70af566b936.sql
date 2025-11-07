-- Add emoji column to categories table
ALTER TABLE public.categories 
ADD COLUMN emoji text DEFAULT '📁';

-- Add comment to explain the column
COMMENT ON COLUMN public.categories.emoji IS 'Emoji to represent the category visually';