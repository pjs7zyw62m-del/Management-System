create table if not exists public.corp_os_workspace_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('worlds','dock','layout','settings')),
 value jsonb not null check (octet_length(value::text) <= 65536),
 primary key(user_id,kind)
);
alter table public.corp_os_workspace_preferences enable row level security;
revoke all on public.corp_os_workspace_preferences from anon;
grant select,insert,update on public.corp_os_workspace_preferences to authenticated;
create policy workspace_read_own on public.corp_os_workspace_preferences for select to authenticated using (auth.uid()=user_id);
create policy workspace_insert_own on public.corp_os_workspace_preferences for insert to authenticated with check (auth.uid()=user_id);
create policy workspace_update_own on public.corp_os_workspace_preferences for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
