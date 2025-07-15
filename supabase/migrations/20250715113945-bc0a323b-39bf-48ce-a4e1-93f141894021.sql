
-- Fix existing bulk links by removing the &redirect= parameter from tracking URLs
UPDATE utm_links 
SET tracking_url = REGEXP_REPLACE(
  tracking_url, 
  '&redirect=[^&]*', 
  '', 
  'g'
)
WHERE source = 'bulk' 
AND tracking_url LIKE '%&redirect=%';
