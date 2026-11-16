create table public.blackcell_ai_video_pilot (
 singleton boolean primary key default true check(singleton),
 id uuid not null unique default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 source_path text not null,
 state text not null check(state in ('reserved','submitted','processing','succeeded','failed','uncertain')),
 provider_task_id text,
 created_at timestamptz not null default now()
);
alter table public.blackcell_ai_video_pilot enable row level security;
revoke all on public.blackcell_ai_video_pilot from public, anon, authenticated;
grant select,insert,update on public.blackcell_ai_video_pilot to service_role;