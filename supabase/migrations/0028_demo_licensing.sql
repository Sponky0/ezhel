-- Add licensing keys to system_settings table
INSERT INTO public.system_settings (key, value)
VALUES 
  ('demo_license_active', 'true'),
  ('demo_expiration_date', '2030-12-31T23:59:59Z')
ON CONFLICT (key) DO NOTHING;
