begin;
create or replace function public.corp_chat_read_timestamp() returns trigger
language plpgsql set search_path to '' as $function$
begin
 if tg_op='INSERT' then
  new.read_at:=null;
  return new;
 end if;
 if (select auth.uid()) is distinct from old.recipient_id then
  raise exception 'Only the recipient may acknowledge a message';
 end if;
 if new.sender_id is distinct from old.sender_id
  or new.recipient_id is distinct from old.recipient_id
  or new.body is distinct from old.body
  or new.created_at is distinct from old.created_at
  or new.id is distinct from old.id
  or new.media_batch_id is distinct from old.media_batch_id
  or new.edited_at is distinct from old.edited_at
  or new.deleted_at is distinct from old.deleted_at
 then raise exception 'Message content cannot be altered during read acknowledgement';
 end if;
 new.read_at:=coalesce(old.read_at,now());
 return new;
end $function$;
commit;
