create table public.blackcell_ai_video_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 source_path text not null,
 model text not null check(model in ('kling-4.0','kling-4.0-flash')),
 resolution text not null,
 duration integer not null,
 estimated_units numeric(7,2) not null check(estimated_units>0),
 state text not null check(state in ('reserved','submitted','processing','succeeded','failed','uncertain')),
 provider_task_id text,
 provider_http integer,
 provider_code integer,
 created_at timestamptz not null default now(),
 check((model='kling-4.0-flash' and resolution='720p' and duration between 3 and 20 and estimated_units=duration*0.6) or (model='kling-4.0' and resolution in ('720p','1080p') and duration between 3 and 30 and estimated_units=duration*case when resolution='720p' then 1.0 else 1.5 end))
);
create unique index blackcell_ai_video_one_active on public.blackcell_ai_video_jobs(user_id) where state in ('reserved','submitted','processing','uncertain');
create index blackcell_ai_video_by_source on public.blackcell_ai_video_jobs(user_id,source_path,created_at desc);
alter table public.blackcell_ai_video_jobs enable row level security;
revoke all on public.blackcell_ai_video_jobs from public,anon,authenticated;
grant select,insert,update on public.blackcell_ai_video_jobs to service_role;
insert into public.blackcell_ai_video_jobs(id,user_id,source_path,model,resolution,duration,estimated_units,state,provider_task_id,provider_http,provider_code,created_at)
select id,user_id,source_path,'kling-4.0-flash','720p',5,3,state,provider_task_id,provider_http,provider_code,created_at from public.blackcell_ai_video_flagship
where state='succeeded' and provider_task_id is not null on conflict(id) do nothing;