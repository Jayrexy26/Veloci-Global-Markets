CREATE TABLE IF NOT EXISTS public.signal_activations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  signal_number integer NOT NULL CHECK (signal_number IN (1,2,3)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','rejected')),
  requested_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  admin_note text
);

ALTER TABLE public.signal_activations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='signal_activations' AND policyname='users_read_own_signals') THEN
    CREATE POLICY users_read_own_signals ON public.signal_activations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='signal_activations' AND policyname='users_insert_own_signals') THEN
    CREATE POLICY users_insert_own_signals ON public.signal_activations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_signal_activations()
RETURNS SETOF public.signal_activations
LANGUAGE sql SECURITY DEFINER
AS $func$
  SELECT * FROM public.signal_activations ORDER BY requested_at DESC;
$func$;

CREATE OR REPLACE FUNCTION public.admin_update_signal_status(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
AS $func$
  UPDATE public.signal_activations SET status = p_status, admin_note = COALESCE(p_note, admin_note), updated_at = now() WHERE id = p_id;
$func$;
