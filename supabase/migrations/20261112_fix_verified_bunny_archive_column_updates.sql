-- Fix Military Library -> Bunny archive sync metadata registration.
-- The original media asset UPDATE grants were restricted to carefully selected
-- fields; archive reference fields were added later but not explicitly granted.
-- Only those two fields are granted. All existing RLS checks remain enabled.

grant update (bunny_storage_path, bunny_synced_at)
on table public.corp_social_assets to authenticated;

-- Owner-only, immutable private Bunny archive references.
create or replace function corp_private.corp_bunny_archive_update_guard()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.bunny_storage_path is distinct from old.bunny_storage_path
    or new.bunny_synced_at is distinct from old.bunny_synced_at then
    if not corp_private.social_verified()
      or not corp_private.is_owner((select auth.uid())) then
      raise exception 'Only a verified BLACKCELL Level 7 owner may save Bunny archive locations'
        using errcode='42501';
    end if;

    if old.source_provider='bunny-private' then
      raise exception 'The original Bunny import link cannot be rewritten'
        using errcode='42501';
    end if;

    if old.bunny_storage_path is not null
      and new.bunny_storage_path is distinct from old.bunny_storage_path then
      raise exception 'Verified Bunny archive location is immutable'
        using errcode='23514';
    end if;

    if new.bunny_storage_path is null
      or new.bunny_storage_path !~ '^blackcell-library/[0-9a-f]{64}\.(jpeg|png|gif|webp|heic)$'
      or new.bunny_synced_at is null then
      raise exception 'Invalid or incomplete private Bunny archive reference'
        using errcode='23514';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_corp_bunny_archive_update_guard on public.corp_social_assets;
create trigger trg_corp_bunny_archive_update_guard
before update of bunny_storage_path, bunny_synced_at
on public.corp_social_assets for each row
execute function corp_private.corp_bunny_archive_update_guard();
