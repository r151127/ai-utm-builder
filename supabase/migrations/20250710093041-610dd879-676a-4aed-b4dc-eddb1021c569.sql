
-- First, drop the existing RLS policies that are causing issues
DROP POLICY IF EXISTS "Users can view their own links or admins can view all" ON public.utm_links;
DROP POLICY IF EXISTS "Users can insert their own links" ON public.utm_links;
DROP POLICY IF EXISTS "Users can update their own links or admins can update all" ON public.utm_links;
DROP POLICY IF EXISTS "Users can delete their own links or admins can delete all" ON public.utm_links;

-- Add user_id column and remove email column
ALTER TABLE public.utm_links 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Copy email to user_id if there's any existing data (this assumes we can match emails)
-- Since the table should be empty based on our investigation, this is mainly for safety
UPDATE public.utm_links 
SET user_id = (SELECT id FROM auth.users WHERE email = utm_links.email)
WHERE user_id IS NULL;

-- Remove the email column
ALTER TABLE public.utm_links DROP COLUMN email;

-- Make user_id NOT NULL now that we've populated it
ALTER TABLE public.utm_links ALTER COLUMN user_id SET NOT NULL;

-- Create new RLS policies using user_id instead of email
CREATE POLICY "Users can view their own links or admins can view all"
  ON public.utm_links
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can insert their own links"
  ON public.utm_links
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their own links or admins can update all"
  ON public.utm_links
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete their own links or admins can delete all"
  ON public.utm_links
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
