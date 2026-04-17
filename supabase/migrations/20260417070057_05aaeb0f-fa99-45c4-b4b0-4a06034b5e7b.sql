-- Table to store Google Calendar OAuth tokens per user
CREATE TABLE public.user_google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  refresh_token text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  google_email text,
  calendar_id text DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view/manage only their own token row
CREATE POLICY "Users view own google calendar token"
ON public.user_google_calendar_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own google calendar token"
ON public.user_google_calendar_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own google calendar token"
ON public.user_google_calendar_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own google calendar token"
ON public.user_google_calendar_tokens
FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_google_calendar_tokens_updated_at
BEFORE UPDATE ON public.user_google_calendar_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add column to appointments to track the Google Calendar event id
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_user_id uuid;