-- Sender-only edit and unsend of sent text messages. Attachment batches remain intact.
begin;
alter table public.corp_chat_messages add column edited_at timestamptz, add column deleted_at timestamptz;
grant update (body,deleted_at) on public.corp_chat_messages to authenticated;
create policy corp_chat_sender_text_update on public.corp_chat_messages for update to authenticated
 using (sender_id=(select auth.uid()) and media_batch_id is null and deleted_at is null and corp_private.chat_verified())
 with check (sender_id=(select auth.uid()) and media_batch_id is null and corp_private.chat_verified());
create function corp_private.chat_text_mutation_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.edited_at:=null; new.deleted_at:=null; return new;
 end if;
 if (select auth.uid()) is distinct from old.sender_id
  or not corp_private.chat_verified()
  or corp_private.is_ledger_only()
  or old.media_batch_id is not null
  or old.deleted_at is not null
  or new.id is distinct from old.id
  or new.sender_id is distinct from old.sender_id
  or new.recipient_id is distinct from old.recipient_id
  or new.created_at is distinct from old.created_at
  or new.media_batch_id is distinct from old.media_batch_id
  or new.read_at is distinct from old.read_at then
  raise exception 'Only the sender may modify their existing text message';
 end if;
 if new.deleted_at is not null then
  new.deleted_at:=now(); new.body:='Message deleted'; new.edited_at:=old.edited_at;
 elsif new.body is distinct from old.body then
  if not corp_private.chat_pair_unblocked(old.recipient_id) or not corp_private.chat_allowed(old.recipient_id) then
   raise exception 'This conversation is no longer available for editing';
  end if;
  new.body:=btrim(new.body); new.edited_at:=now();
 else
  new.edited_at:=old.edited_at;
 end if;
 return new;
end;
$$;
revoke all on function corp_private.chat_text_mutation_guard() from public,anon,authenticated;
create trigger corp_chat_text_mutation_guard before insert or update of body,edited_at,deleted_at on public.corp_chat_messages for each row execute function corp_private.chat_text_mutation_guard();
commit;
