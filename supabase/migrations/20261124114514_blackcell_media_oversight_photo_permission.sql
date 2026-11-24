-- Explicit member authorization and deduplicated private photo references.
ALTER TABLE public.bc_os_private_objects ADD COLUMN IF NOT EXISTS source_object_id uuid REFERENCES public.bc_os_private_objects(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS bc_os_photo_reference_unique ON public.bc_os_private_objects(user_id,source_object_id) WHERE source_object_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS corp_private.bc_os_photo_permissions (
 source_id uuid NOT NULL REFERENCES public.bc_os_private_objects(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(source_id,recipient_id)
);
ALTER TABLE corp_private.bc_os_photo_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.bc_os_photo_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON corp_private.bc_os_photo_permissions TO service_role;
ALTER TABLE corp_private.blackcell_media_oversight_audit DROP CONSTRAINT blackcell_media_oversight_audit_action_check;
ALTER TABLE corp_private.blackcell_media_oversight_audit ADD CONSTRAINT blackcell_media_oversight_audit_action_check CHECK(action IN ('members','files','preview','read','delete_requested','deleted','delete_failed','photo_permission_granted','photo_transferred'));
CREATE OR REPLACE FUNCTION public.bc_os_photo_permission(p_action text,p_actor uuid,p_file uuid,p_recipient uuid,p_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE src public.bc_os_private_objects%ROWTYPE; dest uuid; recipient_label text; path_new text;
BEGIN
 IF p_action NOT IN ('info','approve','transfer') OR p_actor IS NULL OR p_recipient IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
 SELECT coalesce(nullif(display_name,''),username,'BLACKCELL owner') INTO recipient_label FROM public.corp_access_members WHERE user_id=p_recipient AND role='owner' AND clearance_level=7 AND active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
 IF p_action='transfer' THEN
  IF p_actor<>p_recipient OR p_actor=p_target THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_recipient::text,34272));
 ELSE
  IF p_actor<>p_target OR p_actor=p_recipient THEN RAISE EXCEPTION 'Only the source owner may grant permission'; END IF;
 END IF;
 SELECT * INTO src FROM public.bc_os_private_objects WHERE id=p_file AND user_id=p_target AND state='ready' AND source_object_id IS NULL AND path ~* '^Photos/.+\.(jpe?g|png|webp|gif|heic|heif)$' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Photo unavailable'; END IF;
 IF p_action='info' THEN
  RETURN jsonb_build_object('name',regexp_replace(src.path,'^.*/',''),'recipient',recipient_label,'approved',exists(select 1 from corp_private.bc_os_photo_permissions where source_id=p_file and recipient_id=p_recipient and granted_by=p_actor));
 END IF;
 IF p_action='approve' THEN
  INSERT INTO corp_private.bc_os_photo_permissions(source_id,recipient_id,granted_by) VALUES(p_file,p_recipient,p_actor) ON CONFLICT DO NOTHING;
  IF FOUND THEN INSERT INTO corp_private.blackcell_media_oversight_audit(actor_user_id,target_user_id,object_id,file_path,action,reason,outcome) VALUES(p_actor,p_recipient,p_file,src.path,'photo_permission_granted','Explicit source owner consent','ok'); END IF;
  RETURN jsonb_build_object('approved',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM corp_private.bc_os_photo_permissions WHERE source_id=p_file AND recipient_id=p_actor AND granted_by=p_target) THEN RETURN jsonb_build_object('permission_required',true); END IF;
 SELECT id INTO dest FROM public.bc_os_private_objects WHERE user_id=p_actor AND source_object_id=p_file;
 IF FOUND THEN RETURN jsonb_build_object('already',true,'id',dest); END IF;
 path_new:='Photos/Shared-'||src.id::text||'-'||right(regexp_replace(src.path,'^.*/',''),140);
 -- Reuse the existing quota, path collision and file-count reservation checks.
 dest:=public.bc_os_private_reserve(p_actor,path_new,src.size_bytes,repeat('0',64));
 UPDATE public.bc_os_private_objects SET source_object_id=src.id,state='ready',updated_at=clock_timestamp() WHERE id=dest AND user_id=p_actor;
 INSERT INTO corp_private.blackcell_media_oversight_audit(actor_user_id,target_user_id,object_id,file_path,action,reason,outcome) VALUES(p_actor,p_target,p_file,src.path,'photo_transferred','Authorized storage reference','ok');
 RETURN jsonb_build_object('id',dest,'already',false);
END $$;
REVOKE ALL ON FUNCTION public.bc_os_photo_permission(text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc_os_photo_permission(text,uuid,uuid,uuid,uuid) TO service_role;
