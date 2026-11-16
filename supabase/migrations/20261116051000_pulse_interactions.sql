-- BLACKCELL PULSE: authorized social media interactions; no public media URLs.
begin;
create table public.corp_pulse_interactions (
 id uuid primary key default gen_random_uuid(),
 target_kind text not null check(target_kind in ('post','asset','stream')),
 target_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null check(action in ('like','comment','bookmark','report')),
 body text not null default '',
 created_at timestamptz not null default now(),
 check ((action in ('comment','report') and char_length(btrim(body)) between 1 and 1000) or (action in ('like','bookmark') and body='')),
 check (target_kind <> 'post' or action in ('bookmark','report'))
);
create unique index corp_pulse_single_action on public.corp_pulse_interactions(target_kind,target_id,user_id,action) where action<>'comment';
create index corp_pulse_target on public.corp_pulse_interactions(target_kind,target_id,action,created_at);
create index corp_pulse_member on public.corp_pulse_interactions(user_id,action,target_kind,target_id);
alter table public.corp_pulse_interactions enable row level security;
revoke all on public.corp_pulse_interactions from public,anon,authenticated;
grant select,insert,delete on public.corp_pulse_interactions to authenticated;
create policy pulse_read on public.corp_pulse_interactions for select to authenticated using ((select corp_private.social_verified()) and not (select corp_private.is_ledger_only()) and (case target_kind
 when 'post' then exists(select 1 from public.corp_social_posts p where p.id=target_id)
 when 'asset' then exists(select 1 from public.corp_social_assets a where a.id=target_id and a.purpose in ('library','post') and a.kind in ('photo','video') and a.review_status='approved' and a.adult_restricted=false and lower(coalesce(a.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 when 'stream' then exists(select 1 from public.corp_stream_videos v where v.id=target_id and v.review_status='approved' and v.adult_restricted=false and v.upload_status in ('uploaded','processing','ready') and lower(coalesce(v.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 else false end) and (action in ('like','comment') or user_id=(select auth.uid()) or (action='report' and corp_private.is_owner((select auth.uid())))));
create policy pulse_insert on public.corp_pulse_interactions for insert to authenticated with check ((select corp_private.social_verified()) and not (select corp_private.is_ledger_only()) and user_id=(select auth.uid()) and (case target_kind
 when 'post' then exists(select 1 from public.corp_social_posts p where p.id=target_id)
 when 'asset' then exists(select 1 from public.corp_social_assets a where a.id=target_id and a.purpose in ('library','post') and a.kind in ('photo','video') and a.review_status='approved' and a.adult_restricted=false and lower(coalesce(a.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 when 'stream' then exists(select 1 from public.corp_stream_videos v where v.id=target_id and v.review_status='approved' and v.adult_restricted=false and v.upload_status in ('uploaded','processing','ready') and lower(coalesce(v.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 else false end));
create policy pulse_delete on public.corp_pulse_interactions for delete to authenticated using ((select corp_private.social_verified()) and not (select corp_private.is_ledger_only()) and user_id=(select auth.uid()) and action in ('like','bookmark','comment'));
create function public.corp_pulse_summary(p_kind text,p_ids uuid[]) returns table(target_id uuid,hearts bigint,replies bigint,liked boolean,bookmarked boolean) language sql stable security invoker set search_path='' as $$
 select i.target_id,count(*) filter(where i.action='like'),count(*) filter(where i.action='comment'),coalesce(bool_or(i.action='like' and i.user_id=(select auth.uid())),false),coalesce(bool_or(i.action='bookmark' and i.user_id=(select auth.uid())),false)
 from public.corp_pulse_interactions i where i.target_kind=p_kind and i.target_id=any(p_ids) and cardinality(p_ids)<=100 group by i.target_id
$$;
revoke all on function public.corp_pulse_summary(text,uuid[]) from public,anon;
grant execute on function public.corp_pulse_summary(text,uuid[]) to authenticated;
commit;
