create schema bc_mail_private;
revoke all on schema bc_mail_private from public,anon,authenticated;
grant usage on schema bc_mail_private to authenticated;
create table bc_mail_private.mailbox (
 owner_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 sender_id uuid not null,
 recipient_id uuid,
 sender_name text not null,
 recipient_name text not null default '',
 subject text not null default '' check(char_length(subject)<=200),
 body text not null default '' check(char_length(body)<=20000),
 folder text not null check(folder in ('inbox','sent','drafts','archive','trash')),
 origin text not null check(origin in ('inbox','sent','drafts')),
 starred boolean not null default false,
 unread boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create index mail_folder_idx on bc_mail_private.mailbox(owner_id,folder,updated_at desc);
alter table bc_mail_private.mailbox enable row level security;
revoke all on bc_mail_private.mailbox from public,anon,authenticated;

create function bc_mail_private.mail_rpc(p_action text,p_id uuid,p_recipient uuid,p_subject text,p_body text,p_folder text,p_offset integer,p_query text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); catalog jsonb; me public.corp_access_members%rowtype; other public.corp_access_members%rowtype;
 entry bc_mail_private.mailbox%rowtype; result jsonb; counts jsonb; mid uuid; target_folder text;
begin
 if uid is null then return jsonb_build_object('ok',false,'error','Sign in required.'); end if;
 catalog:=public.corp_app_store('catalog');
 if catalog->>'ok' is distinct from 'true' or not exists(select 1 from jsonb_array_elements(coalesce(catalog->'apps','[]'::jsonb)) a where a->>'id'='mail' and a->>'allowed'='true' and a->>'installed'='true') then
  return jsonb_build_object('ok',false,'error','Install Mail from the App Store and verify corporate access.');
 end if;
 select * into me from public.corp_access_members where user_id=uid and active;
 if not found then return jsonb_build_object('ok',false,'error','Access denied.'); end if;
 if p_action='directory' then
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into result from (
   select m.user_id as id,m.display_name as name,'member-'||replace(m.user_id::text,'-','')||'@blackcellcorp.com' as address
   from public.corp_access_members m join bc_store_private.app_rules r on r.app_id='mail' and r.enabled
   where m.user_id<>uid and m.active and m.clearance_level between 1 and 7 and m.access_scope is distinct from 'ledger_only'
    and ((m.role='owner' and m.clearance_level=7) or (m.role='employee' and m.password_activated_at is not null and r.min_level<7 and m.clearance_level>=r.min_level))
    and corp_private.chat_pair_unblocked(m.user_id)
   order by m.display_name limit 250
  ) d;
  return jsonb_build_object('ok',true,'members',result,'address','member-'||replace(uid::text,'-','')||'@blackcellcorp.com','name',me.display_name);
 elsif p_action='list' then
  if p_folder not in ('inbox','sent','drafts','archive','trash','starred') or p_folder is null then return jsonb_build_object('ok',false,'error','Invalid folder.'); end if;
  select jsonb_build_object('inbox',count(*) filter(where folder='inbox'),'unread',count(*) filter(where folder='inbox' and unread),'sent',count(*) filter(where folder='sent'),'drafts',count(*) filter(where folder='drafts'),'archive',count(*) filter(where folder='archive'),'trash',count(*) filter(where folder='trash'),'starred',count(*) filter(where starred and folder<>'trash')) into counts from bc_mail_private.mailbox where owner_id=uid;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.updated_at desc,d.id),'[]'::jsonb) into result from (
   select id,sender_id,recipient_id,sender_name,recipient_name,subject,left(body,140) as snippet,folder,origin,starred,unread,updated_at
   from bc_mail_private.mailbox
   where owner_id=uid and (folder=p_folder or (p_folder='starred' and starred and folder<>'trash'))
    and (coalesce(p_query,'')='' or position(lower(left(p_query,160)) in lower(subject||' '||sender_name||' '||recipient_name||' '||body))>0)
   order by updated_at desc,id limit 50 offset greatest(0,least(coalesce(p_offset,0),100000))
  ) d;
  return jsonb_build_object('ok',true,'items',result,'counts',counts);
 elsif p_action='draft' and p_id is null then
  if char_length(coalesce(p_subject,''))>200 or char_length(coalesce(p_body,''))>20000 then return jsonb_build_object('ok',false,'error','Message too long.'); end if;
  if p_recipient is not null then select * into other from public.corp_access_members where user_id=p_recipient and active; if not found then return jsonb_build_object('ok',false,'error','Recipient unavailable.');end if;end if;
  insert into bc_mail_private.mailbox(owner_id,sender_id,recipient_id,sender_name,recipient_name,subject,body,folder,origin)
   values(uid,uid,p_recipient,coalesce(me.display_name,'Member'),coalesce(other.display_name,''),coalesce(p_subject,''),coalesce(p_body,''),'drafts','drafts') returning id into mid;
  return jsonb_build_object('ok',true,'id',mid);
 end if;
 select * into entry from bc_mail_private.mailbox where owner_id=uid and id=p_id for update;
 if not found then return jsonb_build_object('ok',false,'error','Message unavailable.'); end if;
 if p_action='read' then
  update bc_mail_private.mailbox set unread=false where owner_id=uid and id=p_id;
  entry.unread:=false;return jsonb_build_object('ok',true,'item',to_jsonb(entry)-'owner_id');
 elsif p_action='draft' and entry.folder='drafts' then
  if char_length(coalesce(p_subject,''))>200 or char_length(coalesce(p_body,''))>20000 then return jsonb_build_object('ok',false,'error','Message too long.'); end if;
  if p_recipient is not null then select * into other from public.corp_access_members where user_id=p_recipient and active; if not found then return jsonb_build_object('ok',false,'error','Recipient unavailable.');end if;end if;
  update bc_mail_private.mailbox set recipient_id=p_recipient,recipient_name=coalesce(other.display_name,''),subject=coalesce(p_subject,''),body=coalesce(p_body,''),updated_at=now() where owner_id=uid and id=p_id;
 elsif p_action='send' then
  if entry.origin='sent' then return jsonb_build_object('ok',true,'id',p_id); end if;
  if entry.folder<>'drafts' or entry.recipient_id is null or btrim(entry.body)='' or btrim(entry.subject)='' then return jsonb_build_object('ok',false,'error','Choose a recipient, subject and message.');end if;
  select m.* into other from public.corp_access_members m join bc_store_private.app_rules r on r.app_id='mail' and r.enabled
   where m.user_id=entry.recipient_id and m.user_id<>uid and m.active and m.clearance_level between 1 and 7 and m.access_scope is distinct from 'ledger_only'
   and ((m.role='owner' and m.clearance_level=7) or (m.role='employee' and m.password_activated_at is not null and r.min_level<7 and m.clearance_level>=r.min_level))
   and corp_private.chat_pair_unblocked(m.user_id);
  if not found then return jsonb_build_object('ok',false,'error','Recipient is not available for internal mail.');end if;
  insert into bc_mail_private.mailbox(owner_id,id,sender_id,recipient_id,sender_name,recipient_name,subject,body,folder,origin,unread)
   values(other.user_id,p_id,uid,other.user_id,coalesce(me.display_name,'Member'),coalesce(other.display_name,'Member'),entry.subject,entry.body,'inbox','inbox',true);
  update bc_mail_private.mailbox set folder='sent',origin='sent',recipient_name=coalesce(other.display_name,'Member'),updated_at=now() where owner_id=uid and id=p_id;
 elsif p_action='star' then
  update bc_mail_private.mailbox set starred=not starred where owner_id=uid and id=p_id;
 elsif p_action='unread' then
  update bc_mail_private.mailbox set unread=true where owner_id=uid and id=p_id and origin='inbox';
 elsif p_action='move' then
  target_folder:=case when p_folder='restore' then entry.origin when p_folder='trash' then 'trash' when p_folder='archive' and entry.origin<>'drafts' then 'archive' else null end;
  if target_folder is null then return jsonb_build_object('ok',false,'error','Invalid folder move.'); end if;
  update bc_mail_private.mailbox set folder=target_folder where owner_id=uid and id=p_id;
 else return jsonb_build_object('ok',false,'error','Unknown action.');end if;
 return jsonb_build_object('ok',true,'id',p_id);
end $$;
revoke all on function bc_mail_private.mail_rpc(text,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function bc_mail_private.mail_rpc(text,uuid,uuid,text,text,text,integer,text) to authenticated;
create function public.corp_internal_mail(p_action text,p_id uuid default null,p_recipient uuid default null,p_subject text default null,p_body text default null,p_folder text default null,p_offset integer default 0,p_query text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select bc_mail_private.mail_rpc(p_action,p_id,p_recipient,p_subject,p_body,p_folder,p_offset,p_query)
$$;
revoke all on function public.corp_internal_mail(text,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.corp_internal_mail(text,uuid,uuid,text,text,text,integer,text) to authenticated;