-- Fix the INSERT policy's cross-member lookup without expanding profile visibility.
-- corp_access_members is self-read only; its RLS hides employees from the owner.
create function corp_private.can_create_photo_room(p_member_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
   p_member_id is not null and p_member_id <> auth.uid()
   and corp_private.is_owner(auth.uid())
   and corp_private.photo_ledger_verified()
   and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
   and exists(select 1 from public.corp_access_members m join auth.users u on u.id=m.user_id
     where m.user_id=p_member_id and m.active and m.role='employee'
       and m.password_activated_at is not null and u.email_confirmed_at is not null),false);
$$;
revoke all on function corp_private.can_create_photo_room(uuid) from public,anon,authenticated;
grant execute on function corp_private.can_create_photo_room(uuid) to authenticated;
alter policy corp_photo_rooms_owner_create on public.corp_private_photo_rooms
with check (owner_id=(select auth.uid()) and corp_private.can_create_photo_room(member_id));
