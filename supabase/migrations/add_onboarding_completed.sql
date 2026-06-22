ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Orgs existentes já estão configuradas — pular o wizard para elas
UPDATE public.organizations SET onboarding_completed = TRUE;
