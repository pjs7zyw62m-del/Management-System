create table public.corp_chat_blocks (
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 constraint corp_chat_blocks_distinct check(blocker_id<>blocked_id)
);
create index corp_chat_blocks_blocked_idx on public.corp_chat_blocks(blocked_id,blocker_id);
alter table public.corp_chat_blocks enable row level security;
revoke all on public.corp_chat_blocks from public,anon,authenticated;
grant select,insert,delete on public.corp_chat_blocks to authenticated;
create policy corp_chat_blocks_own_read on public.corp_chat_blocks for select to authenticated using (blocker_id=(select auth.uid()) and (select corp_private.chat_verified()) and not (select corp_private.is_ledger_only()));
create policy corp_chat_blocks_own_insert on public.corp_chat_blocks for insert to authenticated with check (blocker_id=(select auth.uid()) and (select corp_private.chat_verified()) and not (select corp_private.is_ledger_only()) and corp_private.chat_allowed(blocked_id) and (corp_private.is_owner(blocker_id) or corp_private.is_owner(blocked_id)));
create policy corp_chat_blocks_own_delete on public.corp_chat_blocks for delete to authenticated using (blocker_id=(select auth.uid()) and (select corp_private.chat_verified()) and not (select corp_private.is_ledger_only()));
create function corp_private.chat_pair_unblocked(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and p_other is not null and p_other<>(select auth.uid()) and not exists (
 select 1 from public.corp_chat_blocks b where (b.blocker_id=(select auth.uid()) and b.blocked_id=p_other) or (b.blocked_id=(select auth.uid()) and b.blocker_id=p_other)
 );
$$;
revoke all on function corp_private.chat_pair_unblocked(uuid) from public,anon;
grant execute on function corp_private.chat_pair_unblocked(uuid) to authenticated;
create policy corp_chat_blocked_send_guard on public.corp_chat_messages as restrictive for insert to authenticated with check (corp_private.chat_pair_unblocked(recipient_id));
create policy corp_chat_blocked_batch_guard on public.corp_chat_media_batches as restrictive for insert to authenticated with check (corp_private.chat_pair_unblocked(recipient_id));
create policy corp_chat_blocked_item_guard on public.corp_chat_media_items as restrictive for insert to authenticated with check (corp_private.chat_pair_unblocked(recipient_id));
create policy corp_chat_blocked_typing_insert on public.corp_chat_typing as restrictive for insert to authenticated with check (corp_private.chat_pair_unblocked(peer_id));
create policy corp_chat_blocked_typing_update on public.corp_chat_typing as restrictive for update to authenticated using (corp_private.chat_pair_unblocked(peer_id)) with check (corp_private.chat_pair_unblocked(peer_id));
