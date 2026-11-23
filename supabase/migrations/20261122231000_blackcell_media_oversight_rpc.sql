-- Auditing through a service-role-only RPC, without exposing corp_private in PostgREST.
CREATE OR REPLACE FUNCTION public.corp_blackcell_media_oversight_record(
  p_actor uuid,p_target uuid,p_object uuid,p_path text,
  p_action text,p_reason text,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF p_actor IS NULL OR p_action NOT IN ('members','files','preview','read','delete_requested','deleted','delete_failed')
    OR p_outcome NOT IN ('ok','failed') THEN
  RAISE EXCEPTION 'Invalid moderation audit event';
 END IF;
 INSERT INTO corp_private.blackcell_media_oversight_audit
  (actor_user_id,target_user_id,object_id,file_path,action,reason,outcome)
 VALUES(p_actor,p_target,p_object,left(p_path,4000),p_action,left(p_reason,500),p_outcome);
END;$$;
REVOKE ALL ON FUNCTION public.corp_blackcell_media_oversight_record(uuid,uuid,uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_blackcell_media_oversight_record(uuid,uuid,uuid,text,text,text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.corp_blackcell_media_oversight_recent()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 RETURN coalesce((
  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC)
  FROM (
   SELECT id,actor_user_id,target_user_id,object_id,file_path,action,reason,outcome,occurred_at
   FROM corp_private.blackcell_media_oversight_audit
   ORDER BY occurred_at DESC LIMIT 75
  ) x
 ),'[]'::jsonb);
END;$$;
REVOKE ALL ON FUNCTION public.corp_blackcell_media_oversight_recent() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_blackcell_media_oversight_recent() TO service_role;