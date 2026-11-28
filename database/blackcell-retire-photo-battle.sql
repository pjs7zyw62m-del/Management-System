-- Retire Photo Battle without modifying shared photo libraries.
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bc_store_network:photobattle',0));
delete from bc_store_private.installs where app_id='photobattle';
delete from bc_store_private.app_rules where app_id='photobattle';
delete from bc_store_private.network_app_state where app_id='photobattle';
