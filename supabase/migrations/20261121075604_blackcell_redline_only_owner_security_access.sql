-- BLACKCELL REDLINE ONLY (Level R). Access-scope based; preserves numeric clearances.
-- Live Supabase migration 20261121075604. No employee assignments are modified.
create or replace function public.corp_owner_redline_access(p_member_id uuid,p_redline_only boolean)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_scope text;
begin
 if not public.corp_owner_validated() then
  return jsonb_build_object('ok',false,'reason','owner_verification_required');
 end if;
 if p_member_id is null or p_redline_only is null or p_member_id=auth.uid() then
  return jsonb_build_object('ok',false,'reason','invalid_employee');
 end if;
 select m.access_scope into v_scope from public.corp_access_members m
 where m.user_id=p_member_id and m.role='employee' for update;
 if not found then
  return jsonb_build_object('ok',false,'reason','employee_not_found');
 end if;
 v_scope:=case when p_redline_only then 'ledger_only' else 'full' end;
 update public.corp_access_members set access_scope=v_scope
 where user_id=p_member_id and role='employee';
 return jsonb_build_object('ok',true,'member_id',p_member_id,'access_scope',v_scope);
end
$function$;
revoke all on function public.corp_owner_redline_access(uuid,boolean) from public;
revoke all on function public.corp_owner_redline_access(uuid,boolean) from anon;
grant execute on function public.corp_owner_redline_access(uuid,boolean) to authenticated;

create or replace function public.corp_admin_members()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_members jsonb;
begin
 if not public.corp_owner_validated() then
  return jsonb_build_object('ok',false,'reason','owner_verification_required');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',m.user_id,'display_name',m.display_name,'role',m.role,
  'clearance_level',m.clearance_level,'active',m.active,'can_chat',m.can_chat,
  'invited_at',m.invited_at,'username',m.username,
  'password_activated',m.password_activated_at is not null,
  'access_scope',coalesce(m.access_scope,'full'),
  'email',u.email,'activated',u.email_confirmed_at is not null
 ) order by case when m.role='owner' then 0 else 1 end,m.display_name),'[]'::jsonb)
 into v_members
 from public.corp_access_members m left join auth.users u on u.id=m.user_id;
 return jsonb_build_object('ok',true,'members',v_members);
end
$function$;
