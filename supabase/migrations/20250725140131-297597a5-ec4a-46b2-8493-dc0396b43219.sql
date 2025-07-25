-- First, remove duplicate click logs, keeping only the earliest one for each unique combination
DELETE FROM public.click_logs 
WHERE id NOT IN (
  SELECT DISTINCT ON (utm_link_id, ip_address, user_agent) id
  FROM public.click_logs 
  ORDER BY utm_link_id, ip_address, user_agent, created_at ASC
);

-- Now add the unique constraint to prevent future duplicates
ALTER TABLE public.click_logs 
ADD CONSTRAINT unique_utm_link_ip_user_agent 
UNIQUE (utm_link_id, ip_address, user_agent);

-- Add index for better performance on click tracking queries
CREATE INDEX IF NOT EXISTS idx_click_logs_utm_link_tracking 
ON public.click_logs (utm_link_id, ip_address, user_agent);