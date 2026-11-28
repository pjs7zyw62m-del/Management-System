create table public.corp_chat_reactions (
 message_id uuid not null references public.corp_chat_messages(id) on delete cascade,
 reactor_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null check (reaction in ('❤️','👍','👎','😂','‼️','❓')),
 primary key(message_id,reactor_id)
);
create index corp_chat_reactions_reactor_idx on public.corp_chat_reactions(reactor_id);
alter table public.corp_chat_reactions enable row level security;
revoke all on public.corp_chat_reactions from public,anon,authenticated;
grant select,insert,update,delete on public.corp_chat_reactions to authenticated;
create policy reaction_read_participants on public.corp_chat_reactions for select to authenticated using (
 exists(select 1 from public.corp_chat_messages m where m.id=message_id and m.deleted_at is null and (select auth.uid()) in (m.sender_id,m.recipient_id))
);
create policy reaction_insert_own on public.corp_chat_reactions for insert to authenticated with check (
 reactor_id=(select auth.uid()) and exists(select 1 from public.corp_chat_messages m where m.id=message_id and m.deleted_at is null and m.media_batch_id is null
 and (select auth.uid()) in (m.sender_id,m.recipient_id)
 and corp_private.chat_allowed(case when m.sender_id=(select auth.uid()) then m.recipient_id else m.sender_id end)
 and corp_private.chat_pair_unblocked(case when m.sender_id=(select auth.uid()) then m.recipient_id else m.sender_id end)
 and (corp_private.is_owner(m.sender_id) or corp_private.is_owner(m.recipient_id)))
);
create policy reaction_update_own on public.corp_chat_reactions for update to authenticated using (
 reactor_id=(select auth.uid()) and exists(select 1 from public.corp_chat_messages m where m.id=message_id and m.deleted_at is null and (select auth.uid()) in (m.sender_id,m.recipient_id))
) with check (
 reactor_id=(select auth.uid()) and exists(select 1 from public.corp_chat_messages m where m.id=message_id and m.deleted_at is null and m.media_batch_id is null
 and (select auth.uid()) in (m.sender_id,m.recipient_id)
 and corp_private.chat_allowed(case when m.sender_id=(select auth.uid()) then m.recipient_id else m.sender_id end)
 and corp_private.chat_pair_unblocked(case when m.sender_id=(select auth.uid()) then m.recipient_id else m.sender_id end)
 and (corp_private.is_owner(m.sender_id) or corp_private.is_owner(m.recipient_id)))
);
create policy reaction_delete_own on public.corp_chat_reactions for delete to authenticated using (
 reactor_id=(select auth.uid()) and exists(select 1 from public.corp_chat_messages m where m.id=message_id and (select auth.uid()) in (m.sender_id,m.recipient_id))
);