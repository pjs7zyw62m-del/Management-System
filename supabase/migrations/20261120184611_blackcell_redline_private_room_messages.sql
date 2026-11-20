-- Applied to BLACKCELL Supabase as migration 20261120184611.
-- REDLINE room-only chat. Existing two-person verification and RLS guard.
create table if not exists public.corp_private_photo_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.corp_private_photo_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists corp_private_photo_messages_room_time_idx
  on public.corp_private_photo_messages (room_id,created_at desc,id desc);
alter table public.corp_private_photo_messages enable row level security;
revoke all on public.corp_private_photo_messages from public,anon,authenticated;
grant select,insert on public.corp_private_photo_messages to authenticated;
drop policy if exists "redline_messages_participants_read" on public.corp_private_photo_messages;
create policy "redline_messages_participants_read"
  on public.corp_private_photo_messages for select to authenticated
  using (
    corp_private.photo_ledger_verified()
    and exists (
      select 1 from public.corp_private_photo_rooms r
      where r.id=room_id
        and (r.owner_id=(select auth.uid()) or r.member_id=(select auth.uid()))
    )
  );
drop policy if exists "redline_messages_participants_send" on public.corp_private_photo_messages;
create policy "redline_messages_participants_send"
  on public.corp_private_photo_messages for insert to authenticated
  with check (
    sender_id=(select auth.uid())
    and corp_private.photo_ledger_verified()
    and exists (
      select 1 from public.corp_private_photo_rooms r
      where r.id=room_id and r.active
        and (r.owner_id=(select auth.uid()) or r.member_id=(select auth.uid()))
    )
  );
comment on table public.corp_private_photo_messages is
 'BLACKCELL REDLINE private room-only text messages. No update or delete API for authenticated clients.';