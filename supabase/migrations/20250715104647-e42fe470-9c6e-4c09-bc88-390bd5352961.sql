
-- Add email field to store the actual email from Column A of the sheet
ALTER TABLE public.utm_links 
ADD COLUMN email TEXT;

-- Make user_id nullable since bulk imports might not have user accounts
ALTER TABLE public.utm_links 
ALTER COLUMN user_id DROP NOT NULL;

-- Add source field to distinguish between individual (web app) and bulk (sheet) created links
ALTER TABLE public.utm_links 
ADD COLUMN source TEXT DEFAULT 'individual';

-- Add index for better performance on email and source queries
CREATE INDEX idx_utm_links_email ON public.utm_links(email);
CREATE INDEX idx_utm_links_source ON public.utm_links(source);

-- Update RLS policies to handle nullable user_id
DROP POLICY IF EXISTS "Users can view their own links or admins can view all" ON public.utm_links;
DROP POLICY IF EXISTS "Users can insert their own links" ON public.utm_links;
DROP POLICY IF EXISTS "Users can update their own links or admins can update all" ON public.utm_links;
DROP POLICY IF EXISTS "Users can delete their own links or admins can delete all" ON public.utm_links;

-- Create new RLS policies that handle both authenticated users and bulk imports
CREATE POLICY "Users can view their own links or admins can view all or bulk imports"
  ON public.utm_links
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR (user_id IS NULL AND source = 'bulk')
  );

CREATE POLICY "Users can insert their own links or bulk imports"
  ON public.utm_links
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (user_id IS NULL AND source = 'bulk')
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
