-- BLACKCELL Level 0: the sole employee REDLINE-only clearance.
-- Preserve existing accounts; convert any legacy ledger-only employee to Level 0.
ALTER TABLE public.corp_access_members DROP CONSTRAINT IF EXISTS corp_clearance_level_consistent;
UPDATE public.corp_access_members SET clearance_level=0,can_chat=false
 WHERE role='employee' AND access_scope='ledger_only' AND clearance_level<>0;
ALTER TABLE public.corp_access_members ADD CONSTRAINT corp_clearance_level_consistent
 CHECK ((role='owner' AND clearance_level=7 AND access_scope='full')
 OR (role<>'owner' AND ((clearance_level=0 AND access_scope='ledger_only')
 OR (clearance_level BETWEEN 1 AND 6 AND access_scope='full'))));

CREATE OR REPLACE FUNCTION public.corp_admin_update_employee(p_user_id uuid, p_level integer, p_can_chat boolean, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_updated integer;
begin
 if not public.corp_owner_validated() then return jsonb_build_object('ok',false,'reason','owner_verification_required');end if;
 if p_user_id is null or p_level is null or p_level not between 0 and 6 or p_can_chat is null or p_active is null then return jsonb_build_object('ok',false,'reason','invalid_data');end if;
 update public.corp_access_members set clearance_level=p_level,
 access_scope=case when p_level=0 then 'ledger_only' else 'full' end,
 can_chat=case when p_level=0 then false else p_can_chat end,active=p_active
 where user_id=p_user_id and role='employee';
 get diagnostics v_updated=row_count;
 if v_updated<>1 then return jsonb_build_object('ok',false,'reason','not_found_or_owner');end if;
 return jsonb_build_object('ok',true,'clearance_level',p_level,'access_scope',case when p_level=0 then 'ledger_only' else 'full' end);
end $function$;
REVOKE ALL ON FUNCTION public.corp_admin_update_employee(uuid,integer,boolean,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_admin_update_employee(uuid,integer,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_owner_ledger_scope(p_member_id uuid, p_ledger_only boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid:=(select auth.uid());v_scope text;v_name text;v_level integer;
begin
 if not public.corp_owner_validated() then return jsonb_build_object('ok',false,'reason','owner_verification_required');end if;
 if p_member_id is null or p_member_id=v_owner then return jsonb_build_object('ok',false,'reason','invalid_employee');end if;
 select m.display_name,m.access_scope,m.clearance_level into v_name,v_scope,v_level from public.corp_access_members m
 where m.user_id=p_member_id and m.role='employee' and m.active
 and exists(select 1 from public.corp_private_photo_rooms r where r.owner_id=v_owner and r.member_id=p_member_id)
 for update;
 if not found then return jsonb_build_object('ok',false,'reason','employee_room_not_found');end if;
 if p_ledger_only is not null then
  update public.corp_access_members set access_scope=case when p_ledger_only then 'ledger_only' else 'full' end,
  clearance_level=case when p_ledger_only then 0 when v_level=0 then 1 else v_level end,
  can_chat=case when p_ledger_only then false else can_chat end where user_id=p_member_id;
  v_scope=case when p_ledger_only then 'ledger_only' else 'full' end;
  v_level=case when p_ledger_only then 0 when v_level=0 then 1 else v_level end;
 end if;
 return jsonb_build_object('ok',true,'member_id',p_member_id,'display_name',v_name,'access_scope',v_scope,'clearance_level',v_level);
end $function$;
REVOKE ALL ON FUNCTION public.corp_owner_ledger_scope(uuid,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_owner_ledger_scope(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_owner_redline_access(p_member_id uuid, p_redline_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_level integer;v_scope text;
begin
 if not public.corp_owner_validated() then return jsonb_build_object('ok',false,'reason','owner_verification_required');end if;
 if p_member_id is null or p_redline_only is null or p_member_id=(select auth.uid()) then return jsonb_build_object('ok',false,'reason','invalid_employee');end if;
 select clearance_level,access_scope into v_level,v_scope from public.corp_access_members
 where user_id=p_member_id and role='employee' for update;
 if not found then return jsonb_build_object('ok',false,'reason','employee_not_found');end if;
 if p_redline_only then
   update public.corp_access_members set clearance_level=0,access_scope='ledger_only',can_chat=false where user_id=p_member_id;
 else
   update public.corp_access_members set clearance_level=case when v_level=0 then 1 else v_level end,access_scope='full' where user_id=p_member_id;
 end if;
 return jsonb_build_object('ok',true,'member_id',p_member_id,'access_scope',case when p_redline_only then 'ledger_only' else 'full' end,
 'clearance_level',case when p_redline_only then 0 when v_level=0 then 1 else v_level end);
end $function$;
REVOKE ALL ON FUNCTION public.corp_owner_redline_access(uuid,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_owner_redline_access(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_set_clearance_level(p_user_id uuid, p_level integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_updated integer;
begin
 if not public.corp_owner_validated() then return jsonb_build_object('ok',false,'reason','owner_verification_required');end if;
 if p_user_id is null or p_level is null or p_level not between 0 and 6 then return jsonb_build_object('ok',false,'reason','invalid_level');end if;
 update public.corp_access_members set clearance_level=p_level,
 access_scope=case when p_level=0 then 'ledger_only' else 'full' end,
 can_chat=case when p_level=0 then false else can_chat end
 where user_id=p_user_id and role='employee';
 get diagnostics v_updated=row_count;
 if v_updated<>1 then return jsonb_build_object('ok',false,'reason','member_not_found_or_owner');end if;
 return jsonb_build_object('ok',true,'level',p_level,'access_scope',case when p_level=0 then 'ledger_only' else 'full' end);
end $function$;
REVOKE ALL ON FUNCTION public.corp_set_clearance_level(uuid,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_set_clearance_level(uuid,integer) TO authenticated;
