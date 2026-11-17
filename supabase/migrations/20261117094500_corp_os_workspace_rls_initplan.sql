-- Performance-only rewrite of existing owner-only workspace preference policies.
-- Supabase linter auth_rls_initplan: run auth.uid once per statement, not row.
-- Existing authenticated role, user_id equality, and permissions unchanged.
ALTER POLICY workspace_read_own ON public.corp_os_workspace_preferences
 USING ((SELECT auth.uid()) = user_id);

ALTER POLICY workspace_insert_own ON public.corp_os_workspace_preferences
 WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY workspace_update_own ON public.corp_os_workspace_preferences
 USING ((SELECT auth.uid()) = user_id)
 WITH CHECK ((SELECT auth.uid()) = user_id);
