create or replace function public.corp_owner_sitewide_maintenance_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare inventory jsonb;
begin
 if auth.uid() is null or public.corp_owner_validated() is not true then return jsonb_build_object('ok',false,'reason','owner_verification_required'); end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc),'[]'::jsonb) into inventory
 from (select schemaname as schema,relname as table_name,n_live_tup as estimated_rows,n_dead_tup as estimated_dead_rows,pg_total_relation_size(relid) as bytes,last_autovacuum from pg_stat_user_tables where schemaname in ('public','corp_private') order by pg_total_relation_size(relid) desc) t;
 return jsonb_build_object('ok',true,'checked_at',now(),'tables',inventory,
 'expired_typing',(select count(*) from public.corp_chat_typing where expires_at<now()-interval '1 day'),
 'expired_verified',(select count(*) from public.corp_verified_sessions where expires_at<now()-interval '7 days'),
 'expired_gateway',(select count(*) from public.nexus_gateway_grants where expires_at<now()-interval '7 days'),
 'expired_qr',(select count(*) from public.corp_qr_login_requests where expires_at<now()-interval '7 days'),
 'stale_presence',(select count(*) from public.corp_site_presence where last_seen<now()-interval '7 days'));
end;
$$;
revoke all on function public.corp_owner_sitewide_maintenance_status() from public,anon;
grant execute on function public.corp_owner_sitewide_maintenance_status() to authenticated;
create or replace function public.corp_owner_sitewide_clear_expired()
returns jsonb language plpgsql security definer set search_path='' as $$
declare a integer;b integer;c integer;d integer;
begin
 if auth.uid() is null or public.corp_owner_validated() is not true then return jsonb_build_object('ok',false,'reason','owner_verification_required'); end if;
 delete from public.corp_chat_typing where expires_at<now()-interval '1 day';
 get diagnostics a=row_count;
 delete from public.corp_verified_sessions where expires_at<now()-interval '7 days';
 get diagnostics b=row_count;
 delete from public.nexus_gateway_grants where expires_at<now()-interval '7 days';
 get diagnostics c=row_count;
 delete from public.corp_qr_login_requests where expires_at<now()-interval '7 days';
 get diagnostics d=row_count;
 return jsonb_build_object('ok',true,'removed',a+b+c+d,'typing',a,'verified',b,'gateway',c,'qr',d);
end;
$$;
revoke all on function public.corp_owner_sitewide_clear_expired() from public,anon;
grant execute on function public.corp_owner_sitewide_clear_expired() to authenticated;
