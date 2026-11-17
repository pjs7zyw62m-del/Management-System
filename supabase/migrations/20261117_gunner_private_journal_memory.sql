-- PRIVATE fictional Gunner journal archive. The user's 60 story texts are imported
-- directly into Supabase via a secured admin migration, NOT committed to GitHub.
create table if not exists public.corp_gunner_journal_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 journal_id text not null default 'gunner-1999-year-we-met-v1'
   check (length(journal_id) between 3 and 100),
 entry_no integer not null check (entry_no between 1 and 60),
 entry_date date not null,
 title text not null check (length(title) between 1 and 200),
 phase text not null default '' check(length(phase)<=100),
 body text not null check(length(body) between 200 and 6000),
 canonical_status text not null default 'proposed_fictional_canon'
   check (canonical_status='proposed_fictional_canon'),
 source_page integer not null check(source_page between 1 and 60),
 created_at timestamptz not null default now(),
 constraint gunner_journal_owner_entry_unique unique (owner_id,journal_id,entry_no)
);
create index if not exists corp_gunner_journal_owner_date
  on public.corp_gunner_journal_entries (owner_id,entry_date);
create index if not exists corp_gunner_journal_search
  on public.corp_gunner_journal_entries using gin
  (to_tsvector('english',title||' '||phase||' '||body));

alter table public.corp_gunner_journal_entries enable row level security;
revoke all on table public.corp_gunner_journal_entries from public,anon,authenticated;
grant select on table public.corp_gunner_journal_entries to authenticated;

drop policy if exists gunner_private_owner_read on public.corp_gunner_journal_entries;
create policy gunner_private_owner_read on public.corp_gunner_journal_entries
 for select to authenticated using (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and exists (
   select 1 from public.corp_access_members m
   where m.user_id=(select auth.uid()) and m.active=true
    and m.role='owner' and m.clearance_level=7
  )
 );

-- Security-invoker + owner-row RLS. The protected function returns only
-- the small snippets relevant to the current question, never the whole book.
create or replace function public.blackcell_gunner_journal_recall(
 p_question text,
 p_limit integer default 2,
 p_entry_no integer default null
)
returns table (
 entry_no integer,
 entry_date date,
 title text,
 phase text,
 excerpt text,
 canonical_status text,
 relevance real
)
language sql stable security invoker
set search_path to ''
as $fn$
 with question as (
  select
   pg_catalog.plainto_tsquery('english',left(coalesce(p_question,''),240)) as tsq,
   greatest(1,least(coalesce(p_limit,2),3)) as cap
 ),
 ranked as (
  select j.entry_no,j.entry_date,j.title,j.phase,
   left(j.body,950) as excerpt,j.canonical_status,
   case when p_entry_no is not null and j.entry_no=p_entry_no then 100.0
    else pg_catalog.ts_rank_cd(
     pg_catalog.to_tsvector('english',j.title||' '||j.phase||' '||j.body),q.tsq
    ) end::real as relevance
  from public.corp_gunner_journal_entries j cross join question q
  where j.owner_id=(select auth.uid()) and j.journal_id='gunner-1999-year-we-met-v1'
   and (p_entry_no is not null and j.entry_no=p_entry_no
    or pg_catalog.to_tsvector('english',j.title||' '||j.phase||' '||j.body) @@ q.tsq)
 )
 select ranked.entry_no,ranked.entry_date,ranked.title,ranked.phase,
  ranked.excerpt,ranked.canonical_status,ranked.relevance
 from ranked order by ranked.relevance desc,ranked.entry_no asc
 limit (select cap from question);
$fn$;
revoke all on function public.blackcell_gunner_journal_recall(text,integer,integer) from public,anon;
grant execute on function public.blackcell_gunner_journal_recall(text,integer,integer) to authenticated;
