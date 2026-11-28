create table if not exists bc_store_private.network_app_state (
 app_id text primary key, mode text not null check (mode in ('active','suspended','removed')), updated_by uuid not null, updated_at timestamptz not null default now()
);
create table if not exists bc_store_private.network_app_audit (
 id bigint generated always as identity primary key, app_id text not null, action text not null check (action in ('network_suspend','network_remove','network_restore')), actor uuid not null, affected_installations integer not null default 0, occurred_at timestamptz not null default now()
);
alter table bc_store_private.network_app_state enable row level security;
alter table bc_store_private.network_app_audit enable row level security;
revoke all on bc_store_private.network_app_state,bc_store_private.network_app_audit from public,anon,authenticated;
CREATE OR REPLACE FUNCTION bc_store_private.app_store(p_action text, p_app text DEFAULT NULL::text, p_level integer DEFAULT NULL::integer, p_enabled boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; m public.corp_access_members%rowtype; verified jsonb; own boolean; rule bc_store_private.app_rules%rowtype; catalog jsonb; core_catalog jsonb; core_allowed boolean; network_mode text; is_core boolean; removed_count integer:=0; core_ids constant text[]:=array['administration','personalphotos','files','browser','network','chat','forces','photos','film','shorts','person','card','settings']; protected_ids constant text[]:=array['administration','settings','store','developerpreview','omega'];
begin
 if uid is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','Sign in required.'); end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=uid) then return jsonb_build_object('ok',false,'error','Session expired.'); end if;
 select * into m from public.corp_access_members where user_id=uid and active=true;
 if not found or m.clearance_level is null or m.clearance_level not between 1 and 7 then return jsonb_build_object('ok',false,'error','Corporate clearance required.'); end if;
 own:=m.role='owner' and m.clearance_level=7;
 if own then verified:=public.corp_code_status(); elsif m.role='employee' and m.password_activated_at is not null and m.access_scope is distinct from 'ledger_only' then verified:=public.corp_employee_code_status(); else return jsonb_build_object('ok',false,'error','App Store access denied.'); end if;
 if coalesce(verified->>'ok','false')<>'true' or coalesce(verified->>'verified','false')<>'true' then return jsonb_build_object('ok',false,'error','Verify corporate access first.'); end if;
 if p_action in ('network_list','network_suspend','network_remove','network_restore') then
  if not own then return jsonb_build_object('ok',false,'error','Verified Level 7 owner required.'); end if;
  if p_action<>'network_list' then
   if p_app is null or p_app=any(protected_ids) then return jsonb_build_object('ok',false,'error','Essential recovery and security applications are protected.'); end if;
   is_core:=p_app=any(core_ids);
   if not is_core and not exists(select 1 from bc_store_private.app_rules where app_id=p_app) then return jsonb_build_object('ok',false,'error','Unknown application.'); end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bc_store_network:'||p_app,0));
   network_mode:=case p_action when 'network_suspend' then 'suspended' when 'network_remove' then 'removed' else 'active' end;
   insert into bc_store_private.network_app_state(app_id,mode,updated_by,updated_at) values(p_app,network_mode,uid,now())
    on conflict(app_id) do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
   if p_action='network_remove' then
    if is_core then
     insert into bc_store_private.core_removed(user_id,app_id)
      select distinct u.id,p_app from auth.users u join public.corp_access_members c on c.user_id=u.id
      where (p_app<>'card' or c.role<>'owner') and (p_app<>'chat' or c.role='owner' or coalesce(c.can_chat,false))
      on conflict do nothing;
     get diagnostics removed_count=row_count;
    else
     delete from bc_store_private.installs where app_id=p_app;
     get diagnostics removed_count=row_count;
    end if;
   elsif p_action='network_restore' and not is_core then
    update bc_store_private.app_rules set enabled=true,updated_at=now() where app_id=p_app;
   end if;
   insert into bc_store_private.network_app_audit(app_id,action,actor,affected_installations) values(p_app,p_action,uid,removed_count);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'core',a.core,'protected',a.id=any(protected_ids),'state',case when coalesce(n.mode,'active')<>'active' then n.mode when not a.enabled then 'suspended' else 'active' end,'minLevel',a.min_level,'installationRecords',case when a.core then null else (select count(*) from bc_store_private.installs i where i.app_id=a.id) end,'updatedAt',n.updated_at) order by a.id),'[]'::jsonb) into catalog
  from (select r.app_id id,false core,r.enabled,r.min_level from bc_store_private.app_rules r where not (r.app_id=any(core_ids)) union all select x,true,true,case when x='administration' then 7 else 1 end from unnest(core_ids) x union all select 'store',true,true,1 union all select 'developerpreview',true,true,7) a
  left join bc_store_private.network_app_state n on n.app_id=a.id;
  return jsonb_build_object('ok',true,'owner',true,'apps',catalog,'affected',removed_count);
 end if;
 if p_app is not null and p_action in ('install','remove','set_rule') then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bc_store_network:'||p_app,0));
  select mode into network_mode from bc_store_private.network_app_state where app_id=p_app;
  if p_action='install' and coalesce(network_mode,'active')<>'active' then return jsonb_build_object('ok',false,'error','Application disabled across the network.'); end if;
  if p_action='set_rule' and coalesce(network_mode,'active')<>'active' then return jsonb_build_object('ok',false,'error','Restore network distribution in Administration first.'); end if;
 end if;
 if p_action='remove_all' then
  insert into bc_store_private.core_removed(user_id,app_id)
  select uid,x.app_id from unnest(array['administration','personalphotos','files','browser','network','chat','forces','photos','film','shorts','person','card','settings']::text[]) as x(app_id)
  where (x.app_id <> 'administration' or own) and (x.app_id <> 'card' or not own) and (x.app_id <> 'chat' or own or coalesce(m.can_chat,false))
  on conflict do nothing;
  delete from bc_store_private.installs where user_id=uid;
 elsif p_action in ('install','remove') and p_app in ('administration','personalphotos','files','browser','network','chat','forces','photos','film','shorts','person','card','settings') then
  core_allowed:=(p_app <> 'administration' or own) and (p_app <> 'card' or not own) and (p_app <> 'chat' or own or coalesce(m.can_chat,false));
  if not core_allowed then return jsonb_build_object('ok',false,'error','Your access level does not permit this application.'); end if;
  if p_action='install' then delete from bc_store_private.core_removed where user_id=uid and app_id=p_app;
  else insert into bc_store_private.core_removed(user_id,app_id) values(uid,p_app) on conflict do nothing; end if;
 elsif p_action='set_rule' then
  if not own then return jsonb_build_object('ok',false,'error','Level 7 administrator required.'); end if;
  if p_level is null or p_level not between 1 and 7 or p_enabled is null then return jsonb_build_object('ok',false,'error','Invalid clearance rule.'); end if;
  update bc_store_private.app_rules set min_level=p_level,enabled=p_enabled,updated_at=now() where app_id=p_app;
  if not found then return jsonb_build_object('ok',false,'error','Unknown application.'); end if;
 elsif p_action in ('install','remove') then
  select * into rule from bc_store_private.app_rules where app_id=p_app for share;
  if not found then return jsonb_build_object('ok',false,'error','Application unavailable.'); end if;
  if p_action='install' then
   if not rule.enabled or not (own or (rule.min_level<7 and m.clearance_level>=rule.min_level)) then return jsonb_build_object('ok',false,'error','Your access level does not permit this installation.'); end if;
   insert into bc_store_private.installs(user_id,app_id) values(uid,p_app) on conflict do nothing;
  else delete from bc_store_private.installs where user_id=uid and app_id=p_app; end if;
 elsif p_action is distinct from 'catalog' then return jsonb_build_object('ok',false,'error','Unknown action.'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.app_id,'minLevel',r.min_level,'enabled',r.enabled and coalesce(n.mode,'active')='active','allowed',r.enabled and coalesce(n.mode,'active')='active' and (own or (r.min_level<7 and m.clearance_level>=r.min_level)),'installed',exists(select 1 from bc_store_private.installs i where i.user_id=uid and i.app_id=r.app_id)) order by r.app_id),'[]'::jsonb) into catalog from bc_store_private.app_rules r left join bc_store_private.network_app_state n on n.app_id=r.app_id where own or (r.enabled and coalesce(n.mode,'active')='active' and r.min_level<7 and m.clearance_level>=r.min_level);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.app_id,'minLevel',case when x.app_id='administration' then 7 else 1 end,'enabled',coalesce(n.mode,'active')='active','allowed',coalesce(n.mode,'active')='active','installed',not exists(select 1 from bc_store_private.core_removed d where d.user_id=uid and d.app_id=x.app_id),'core',true) order by x.app_id),'[]'::jsonb) into core_catalog
 from unnest(array['administration','personalphotos','files','browser','network','chat','forces','photos','film','shorts','person','card','settings']::text[]) as x(app_id) left join bc_store_private.network_app_state n on n.app_id=x.app_id
 where (own or coalesce(n.mode,'active')='active') and (x.app_id <> 'administration' or own) and (x.app_id <> 'card' or not own) and (x.app_id <> 'chat' or own or coalesce(m.can_chat,false));
 return jsonb_build_object('ok',true,'owner',own,'level',m.clearance_level,'apps',catalog||core_catalog);
end $function$
