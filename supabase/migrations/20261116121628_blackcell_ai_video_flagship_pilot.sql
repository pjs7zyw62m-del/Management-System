create table public.blackcell_ai_video_flagship (
 like public.blackcell_ai_video_retry including defaults including constraints including indexes,
 constraint blackcell_ai_video_flagship_user_fkey foreign key(user_id) references auth.users(id)
);
alter table public.blackcell_ai_video_flagship enable row level security;
revoke all on public.blackcell_ai_video_flagship from public,anon,authenticated;
grant select,insert,update on public.blackcell_ai_video_flagship to service_role;