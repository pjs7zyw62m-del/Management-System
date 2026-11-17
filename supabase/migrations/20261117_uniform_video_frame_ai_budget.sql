-- BLACKCELL private video-frame AI budget (installed 2026-11-17).
create table if not exists public.corp_uniform_video_ai_usage (
 owner_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null,
 requests smallint not null default 0 check(requests between 0 and 20),
 updated_at timestamptz not null default now(),
 primary key(owner_id,usage_day)
);
alter table public.corp_uniform_video_ai_usage enable row level security;
revoke all on table public.corp_uniform_video_ai_usage from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.blackcell_uniform_video_frame_consume()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_status jsonb; v_n smallint;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
 if not exists(select 1 from public.corp_access_members m where m.user_id=v_uid and m.active=true and m.role='owner' and m.clearance_level=7) then
   return jsonb_build_object('ok',false,'code','OWNER_REQUIRED'); end if;
 v_status:=public.corp_code_status();
 if coalesce((v_status->>'verified')::boolean,false) is not true
 or coalesce((v_status->>'ok')::boolean,false) is not true then
   return jsonb_build_object('ok',false,'code','CORPORATE_ACCESS_REQUIRED'); end if;
 insert into public.corp_uniform_video_ai_usage(owner_id,usage_day,requests)
 values(v_uid,(now() at time zone 'utc')::date,1)
 on conflict(owner_id,usage_day) do update
 set requests=public.corp_uniform_video_ai_usage.requests+1,updated_at=now()
 where public.corp_uniform_video_ai_usage.requests<20
 returning requests into v_n;
 if v_n is null then return jsonb_build_object('ok',false,'code','DAILY_LIMIT','remaining',0);end if;
 return jsonb_build_object('ok',true,'used',v_n,'remaining',20-v_n);
end $function$;
revoke all on function public.blackcell_uniform_video_frame_consume() from public,anon;
grant execute on function public.blackcell_uniform_video_frame_consume() to authenticated;
