-- Add emulator testing toggle key to system_settings table
INSERT INTO public.system_settings (key, value)
VALUES 
  ('emulator_mode_active', 'true')
ON CONFLICT (key) DO NOTHING;
