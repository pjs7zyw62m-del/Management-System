-- Cost cap for BLACKCELL Uniform Assistant. Conversation text is NOT persisted.
create table if not exists public.corp_uniform_assistant_daily_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null default (now() at time zone 'utc')::date,
 requests integer not null default 0 check(requests between 0 and 30),
 updated_at timestamptz not null default now(),
 primary key(user_id,usage_day)
);
alter table public.corp_uniform_assistant_daily_usage enable row level security;
revoke all on public.corp_uniform_assistant_daily_usage from public,anon,authenticated;
create or replace function public.blackcell_uniform_assistant_consume()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := (select auth.uid());
 v_owner boolean := false;
 v_status jsonb; v_calls integer;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
 select exists(select 1 from public.corp_access_members m
   where m.user_id=v_uid and m.role='owner' and m.active=true and m.clearance_level=7)
 into v_owner;
 if not v_owner then return jsonb_build_object('ok',false,'code','OWNER_REQUIRED'); end if;
 v_status:=public.corp_code_status();
 if not coalesce((v_status->>'ok')::boolean,false)
   or not coalesce((v_status->>'verified')::boolean,false) then
  return jsonb_build_object('ok',false,'code','CORPORATE_ACCESS_REQUIRED');
 end if;
 insert into public.corp_uniform_assistant_daily_usage(user_id,usage_day,requests)
 values(v_uid,(now() at time zone 'utc')::date,1)
 on conflict (user_id,usage_day) do update
 set requests=public.corp_uniform_assistant_daily_usage.requests+1,updated_at=now()
 where public.corp_uniform_assistant_daily_usage.requests<30
 returning requests into v_calls;
 if v_calls is null then return jsonb_build_object('ok',false,'code','DAILY_LIMIT','remaining',0); end if;
 return jsonb_build_object('ok',true,'remaining',30-v_calls,'used',v_calls);
end $$;
revoke all on function public.blackcell_uniform_assistant_consume() from public,anon;
grant execute on function public.blackcell_uniform_assistant_consume() to authenticated;
