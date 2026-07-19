-- ===========================================
-- TASKMASTER - PATCH: roles + biometric login
-- ===========================================
-- Run this after foundation_schema.sql / modules_schema.sql.
-- Safe to re-run.

-- Align public.users.role to exactly the 5 roles used across the app.
do $$
begin
  alter table public.users drop constraint if exists users_role_check;
  alter table public.users
    add constraint users_role_check
    check (role in ('Super Admin','Admin','Manager','Employee','Intern'));
exception when others then
  raise notice 'users_role_check already matches or could not be altered: %', sqlerrm;
end $$;

-- Device-bound biometric login (WebAuthn platform authenticator).
-- Stores the browser/device credential id so a fingerprint/Face ID prompt
-- on a *previously enrolled* device can sign the person back in.
alter table public.users add column if not exists webauthn_credential_id text;
