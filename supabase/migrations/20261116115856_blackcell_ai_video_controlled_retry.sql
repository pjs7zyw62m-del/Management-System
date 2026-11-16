create table public.blackcell_ai_video_retry (
 like public.blackcell_ai_video_pilot including defaults including constraints including indexes,
 provider_http integer, provider_code integer,
 constraint blackcell_ai_video_retry_user_fkey foreign key(user_id) references auth.users(id)
);
alter table public.blackcell_ai_video_retry enable row level security;
revoke all on public.blackcell_ai_video_retry from public,anon,authenticated;
grant select,insert,update on public.blackcell_ai_video_retry to service_role;