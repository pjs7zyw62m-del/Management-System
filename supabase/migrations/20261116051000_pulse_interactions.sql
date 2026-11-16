-- BLACKCELL PULSE: authorized social media interactions; no public media URLs.
begin;
create table public.corp_pulse_interactions (
 id uuid primary key default gen_random_uuid(),
 target_kind text not null check(target_kind in ('post','asset','stream')),
 target_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null check(action in ('like','comment','bookmark','report','view')),
 body text not null default '',
 created_at timestamptz not null default now(),
 check ((action in ('comment','report') and char_length(btrim(body)) between 1 and 1000) or (action in ('like','bookmark','view') and body='')),
 check (target_kind <> 'post' or action in ('bookmark','report','view'))
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

-- Each verified member counts at most once per item. Viewer identities stay private.
create function corp_private.pulse_view_counts(p_kind text,p_ids uuid[])
returns table(target_id uuid,views bigint)
language sql stable security definer set search_path='' as $$
 select x.id,count(i.id)
 from (select distinct unnest(p_ids) as id) x
 join public.corp_pulse_interactions i on i.target_id=x.id and i.target_kind=p_kind and i.action='view'
 where (select auth.uid()) is not null and (select corp_private.social_verified()) and not (select corp_private.is_ledger_only())
 and cardinality(p_ids)<=100 and (case p_kind
 when 'post' then exists(select 1 from public.corp_social_posts p where p.id=x.id and corp_private.social_member_active(p.author_id))
 when 'asset' then exists(select 1 from public.corp_social_assets a where a.id=x.id and corp_private.social_member_active(a.owner_id) and a.purpose in ('library','post') and a.kind in ('photo','video') and a.review_status='approved' and a.adult_restricted=false and lower(coalesce(a.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 when 'stream' then exists(select 1 from public.corp_stream_videos v where v.id=x.id and corp_private.social_member_active(v.owner_id) and v.review_status='approved' and v.adult_restricted=false and v.upload_status in ('uploaded','processing','ready') and lower(coalesce(v.video_category,'')) not in ('movie','series','documentary','tv','tv show','tv_show'))
 else false end)
 group by x.id
$$;
revoke all on function corp_private.pulse_view_counts(text,uuid[]) from public,anon,authenticated;
grant execute on function corp_private.pulse_view_counts(text,uuid[]) to authenticated;
create function public.corp_pulse_record_views(p_kind text,p_ids uuid[]) returns void
language sql volatile security invoker set search_path='' as $$
 insert into public.corp_pulse_interactions(target_kind,target_id,user_id,action)
 select p_kind,x.id,(select auth.uid()),'view' from (select distinct unnest(p_ids) as id) x
 where cardinality(p_ids)<=100 and (select auth.uid()) is not null
 on conflict (target_kind,target_id,user_id,action) where action<>'comment' do nothing
$$;
revoke all on function public.corp_pulse_record_views(text,uuid[]) from public,anon;
grant execute on function public.corp_pulse_record_views(text,uuid[]) to authenticated;
create index corp_pulse_repost_marker on public.corp_social_posts ((substring(body from '(BLACKCELL REBLOG: [0-9a-fA-F-]{36}|BLACKCELL MEDIA: (?:asset|stream):[0-9a-fA-F-]{36})$')));
create function public.corp_pulse_summary(p_kind text,p_ids uuid[]) returns table(target_id uuid,hearts bigint,replies bigint,liked boolean,bookmarked boolean,reposts bigint,reposted boolean,views bigint)
language sql stable security invoker set search_path='' as $$
 with ids as (select distinct unnest(p_ids) id where cardinality(p_ids)<=100),
 interactions as (select i.target_id,count(*) filter(where i.action='like') hearts,count(*) filter(where i.action='comment') replies,
 coalesce(bool_or(i.action='like' and i.user_id=(select auth.uid())),false) liked,
 coalesce(bool_or(i.action='bookmark' and i.user_id=(select auth.uid())),false) bookmarked
 from public.corp_pulse_interactions i join ids on ids.id=i.target_id where i.target_kind=p_kind group by i.target_id),
 reposts as (select ids.id,count(p.id) total,coalesce(bool_or(p.author_id=(select auth.uid())),false) mine from ids
 left join public.corp_social_posts p on substring(p.body from '(BLACKCELL REBLOG: [0-9a-fA-F-]{36}|BLACKCELL MEDIA: (?:asset|stream):[0-9a-fA-F-]{36})$') =
 case p_kind when 'post' then 'BLACKCELL REBLOG: '||ids.id::text when 'asset' then 'BLACKCELL MEDIA: asset:'||ids.id::text when 'stream' then 'BLACKCELL MEDIA: stream:'||ids.id::text else null end
 group by ids.id)
 select ids.id,coalesce(i.hearts,0),coalesce(i.replies,0),coalesce(i.liked,false),coalesce(i.bookmarked,false),coalesce(r.total,0),coalesce(r.mine,false),coalesce(v.views,0)
 from ids left join interactions i on i.target_id=ids.id left join reposts r on r.id=ids.id left join corp_private.pulse_view_counts(p_kind,p_ids) v on v.target_id=ids.id
$$;
revoke all on function public.corp_pulse_summary(text,uuid[]) from public,anon;
grant execute on function public.corp_pulse_summary(text,uuid[]) to authenticated;
create table public.corp_pulse_mutes (
 user_id uuid not null references auth.users(id) on delete cascade,
 muted_user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,muted_user_id),
 check(user_id<>muted_user_id)
);
alter table public.corp_pulse_mutes enable row level security;
revoke all on public.corp_pulse_mutes from public,anon,authenticated;
grant select,insert,delete on public.corp_pulse_mutes to authenticated;
create policy pulse_mute_read on public.corp_pulse_mutes for select to authenticated using (user_id=(select auth.uid()) and (select corp_private.social_verified()) and not (select corp_private.is_ledger_only()));
create policy pulse_mute_insert on public.corp_pulse_mutes for insert to authenticated with check (user_id=(select auth.uid()) and (select corp_private.social_verified()) and not (select corp_private.is_ledger_only()) and corp_private.social_member_active(muted_user_id));
create policy pulse_mute_delete on public.corp_pulse_mutes for delete to authenticated using (user_id=(select auth.uid()) and (select corp_private.social_verified()) and not (select corp_private.is_ledger_only()));
commit;
