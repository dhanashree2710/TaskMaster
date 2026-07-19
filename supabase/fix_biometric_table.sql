-- ===========================================
-- FIX: "Could not find the table 'public.user_biometric_credentials'
-- in the schema cache"
-- ===========================================
-- This table is already defined in modules_schema.sql, but your live
-- Supabase project either never had that file run against it, or the
-- PostgREST schema cache went stale after it was created. This script
-- is safe to run by itself, any number of times, to fix both.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.

create extension if not exists "uuid-ossp";

create table if not exists public.user_biometric_credentials (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(user_id) on delete cascade,
    credential_id text unique not null,
    device_label text,
    created_at timestamptz default now()
);

alter table public.user_biometric_credentials disable row level security;

-- Force PostgREST to pick up the table immediately instead of waiting
-- for its next automatic cache refresh.
notify pgrst, 'reload schema';
