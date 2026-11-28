-- Purge stale SDP even if both browser tabs disappear.
select cron.schedule('blackcell-connect-expiry','* * * * *',$job$
 update bc_connect_private.calls c set state=case when c.state='ringing' then 'missed' else 'ended' end,offer=null,answer=null,ended_at=now()
 where c.state in ('ringing','accepted') and (c.created_at<now()-interval '3 hours' or c.caller_seen<now()-interval '45 seconds' or (c.state='ringing' and c.created_at<now()-interval '90 seconds') or (c.state='accepted' and c.callee_seen<now()-interval '45 seconds'));
 delete from bc_connect_private.calls where ended_at<now()-interval '7 days';
$job$);