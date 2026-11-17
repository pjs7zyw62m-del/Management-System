-- BLACKCELL OMEGA, phase one. Uses existing media, no generated assets.
-- Case files are private member notes about explicitly approved, rights-confirmed,
-- non-adult media. They never alter publication status or the original asset.
create table if not exists public.corp_omega_cases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_id uuid not null references public.corp_social_assets(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 160),
 note text not null default '' check (char_length(note)<=4000),
 stage text not null default 'research'
  check (stage in ('research','evidence','complete')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,asset_id)
);
create index if not exists corp_omega_cases_member_recent
 on public.corp_omega_cases (user_id,updated_at desc);
alter table public.corp_omega_cases enable row level security;
revoke all on table public.corp_omega_cases from public,anon,authenticated;
grant select,insert,update,delete on table public.corp_omega_cases to authenticated;

drop policy if exists omega_private_cases_read on public.corp_omega_cases;
create policy omega_private_cases_read on public.corp_omega_cases for select
 to authenticated using (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
 and exists (select 1 from public.corp_social_assets a
  where a.id=asset_id and a.review_status='approved'
   and a.rights_confirmed=true and a.adult_restricted=false
   and a.purpose in ('library','post') and a.kind in ('photo','video')
   and coalesce(a.video_category,'') not in ('movie','series','tv','television'))
);
drop policy if exists omega_private_cases_add on public.corp_omega_cases;
create policy omega_private_cases_add on public.corp_omega_cases for insert
 to authenticated with check (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
 and exists (select 1 from public.corp_social_assets a
  where a.id=asset_id and a.review_status='approved'
   and a.rights_confirmed=true and a.adult_restricted=false
   and a.purpose in ('library','post') and a.kind in ('photo','video')
   and lower(coalesce(a.video_category,'')) not in ('movie','series','tv','television'))
);
drop policy if exists omega_private_cases_edit on public.corp_omega_cases;
create policy omega_private_cases_edit on public.corp_omega_cases for update
 to authenticated using (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
 ) with check (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
 and exists(select 1 from public.corp_social_assets a
  where a.id=asset_id and a.review_status='approved'
   and a.rights_confirmed=true and a.adult_restricted=false
   and a.purpose in ('library','post') and a.kind in ('photo','video')
   and lower(coalesce(a.video_category,'')) not in ('movie','series','tv','television'))
);
drop policy if exists omega_private_cases_remove on public.corp_omega_cases;
create policy omega_private_cases_remove on public.corp_omega_cases for delete
 to authenticated using (
 user_id=(select auth.uid()) and (select corp_private.social_verified())
 and not (select corp_private.is_ledger_only())
);
-- OMEGA appears as an authorized OS App Store application, initially owner-only.
insert into bc_store_private.app_rules(app_id,min_level,enabled)
 values ('omega',7,true) on conflict (app_id) do nothing;
-- The already-verified corporate owner should see it automatically in OS.
insert into bc_store_private.installs(user_id,app_id)
 select m.user_id,'omega' from public.corp_access_members m
 where m.role='owner' and m.clearance_level=7 and m.active=true
 on conflict do nothing;
