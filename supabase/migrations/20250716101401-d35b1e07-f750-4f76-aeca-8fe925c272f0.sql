
-- Add unique_clicks column to utm_links table
ALTER TABLE public.utm_links 
ADD COLUMN unique_clicks INTEGER DEFAULT 0;

-- Create click_logs table to track individual clicks for unique counting
CREATE TABLE public.click_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  utm_link_id UUID NOT NULL REFERENCES public.utm_links(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX idx_click_logs_utm_link_id ON public.click_logs(utm_link_id);
CREATE INDEX idx_click_logs_ip_user_agent ON public.click_logs(ip_address, user_agent);
CREATE INDEX idx_utm_links_unique_clicks ON public.utm_links(unique_clicks);

-- Enable RLS on click_logs table
ALTER TABLE public.click_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for click_logs (admins can view all, users can view their link's clicks)
CREATE POLICY "Admins can view all click logs"
  ON public.click_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view click logs for their links"
  ON public.click_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.utm_links 
      WHERE utm_links.id = click_logs.utm_link_id 
      AND utm_links.user_id = auth.uid()
    )
  );

-- Allow the track-click function to insert click logs
CREATE POLICY "Allow click tracking inserts"
  ON public.click_logs
  FOR INSERT
  WITH CHECK (true);
