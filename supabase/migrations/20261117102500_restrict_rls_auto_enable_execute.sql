-- Security hardening: PostgreSQL event triggers execute as the installed
-- database event trigger, not as a browser RPC caller. This SECURITY DEFINER
-- routine applies RLS automatically to newly-created public tables.
-- It must never be exposed for direct API execution.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
