-- Add unique constraint to prevent duplicate click logs from same user/device
ALTER TABLE public.click_logs 
ADD CONSTRAINT unique_utm_link_ip_user_agent 
UNIQUE (utm_link_id, ip_address, user_agent);

-- Add index for better performance on click tracking queries
CREATE INDEX IF NOT EXISTS idx_click_logs_utm_link_tracking 
ON public.click_logs (utm_link_id, ip_address, user_agent);