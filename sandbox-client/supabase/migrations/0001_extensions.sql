-- 0001_extensions.sql
-- Enable required extensions.
--   pgcrypto -> gen_random_uuid() for primary keys (also built-in on PG13+)
--   citext   -> case-insensitive text comparison (emails)
-- Idempotent; safe to run in local, staging, and production.

create extension if not exists pgcrypto;
create extension if not exists citext;
