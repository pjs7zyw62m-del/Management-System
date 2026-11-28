-- New corporate members receive no preinstalled app shortcuts except App Store.
-- Existing accounts are not modified. This trigger applies only on enrollment.
create or replace function bc_store_private.initialize_new_member_apps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Owner retains the executive recovery workspace. All other newly
  -- enrolled members start without any of the implicitly installed core apps.
  if new.role is distinct from 'owner' then
    insert into bc_store_private.core_removed(user_id, app_id)
    select new.user_id, a.app_id
    from unnest(array['administration','personalphotos','files','browser','network','chat','forces','photos','film','shorts','person','card','settings']::text[]) as a(app_id)
    on conflict (user_id, app_id) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function bc_store_private.initialize_new_member_apps() from public, anon, authenticated;
drop trigger if exists bc_store_initialize_new_member_apps on public.corp_access_members;
create trigger bc_store_initialize_new_member_apps
after insert on public.corp_access_members
for each row execute function bc_store_private.initialize_new_member_apps();
