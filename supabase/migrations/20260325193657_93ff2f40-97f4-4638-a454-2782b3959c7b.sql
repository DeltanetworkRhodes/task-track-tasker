
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_lat float8,
ADD COLUMN IF NOT EXISTS last_long float8,
ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
