-- BLACKCELL voluntary video preferences for Seven Worlds and For You.
-- Independently isolated by member ID, verified corporate session, and RLS.
-- No behavioral signal is created without an enabled opt-in. Explicit More/Less
-- button presses are a separate voluntary action.
create table if not exists public.corp_social_video_interest (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_id uuid not null references public.corp_social_assets(id) on delete cascade,
 reaction text not null default 'neutral' check (reaction in ('neutral','more','less')),
 engaged_views integer not null default 0 check (engaged_views between 0 and 1000000),
 last_engaged_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(user_id,asset_id)
);
alter table public.corp_social_video_interest enable row level security;
revoke all on table public.corp_social_video_interest from public,anon,authenticated;
grant select,insert,update,delete on table public.corp_social_video_interest to authenticated;

create policy video_interest_read_own on public.corp_social_video_interest
 for select to authenticated using (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
);
create policy video_interest_insert_own on public.corp_social_video_interest
 for insert to authenticated with check (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
 and exists(select 1 from public.corp_social_assets a where a.id=asset_id
   and a.kind='video' and a.review_status='approved' and a.adult_restricted=false)
);
create policy video_interest_update_own on public.corp_social_video_interest
 for update to authenticated
 using (user_id=(select auth.uid()) and (select corp_private.social_verified())
   and not (select corp_private.is_ledger_only()))
 with check (user_id=(select auth.uid()) and (select corp_private.social_verified())
   and not (select corp_private.is_ledger_only())
   and exists(select 1 from public.corp_social_assets a where a.id=asset_id
     and a.kind='video' and a.review_status='approved' and a.adult_restricted=false));
create policy video_interest_delete_own on public.corp_social_video_interest
 for delete to authenticated using (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
);

-- 15 actual seconds of visible playback is one weak signal, not a like.
-- This invoker function does not circumvent the table RLS policies.
create or replace function public.corp_record_video_engagement(p_asset_id uuid)
returns boolean
language plpgsql security invoker set search_path to ''
as $fn$
declare v_uid uuid := (select auth.uid()); v_saved boolean := false;
begin
 if v_uid is null or not (select corp_private.social_verified())
  or (select corp_private.is_ledger_only()) then return false; end if;
 if not exists (
  select 1 from public.corp_social_personalization_settings p
  where p.user_id=v_uid and p.enabled=true and p.rediscovery_enabled=true
 ) then return false; end if;
 insert into public.corp_social_video_interest(user_id,asset_id,engaged_views,last_engaged_at)
 select v_uid,a.id,1,now() from public.corp_social_assets a
 where a.id=p_asset_id and a.kind='video' and a.review_status='approved'
  and a.adult_restricted=false
 on conflict (user_id,asset_id) do update
 set engaged_views=least(public.corp_social_video_interest.engaged_views+1,1000000),
     last_engaged_at=now(),updated_at=now()
 where public.corp_social_video_interest.last_engaged_at is null
    or public.corp_social_video_interest.last_engaged_at<=now()-interval '15 seconds';
 get diagnostics v_saved = row_count;
 return v_saved;
end
$fn$;
revoke all on function public.corp_record_video_engagement(uuid) from public,anon;
grant execute on function public.corp_record_video_engagement(uuid) to authenticated;
