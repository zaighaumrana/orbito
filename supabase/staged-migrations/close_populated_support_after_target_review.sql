-- NOT an automatically discovered migration. Target-specific adoption only.
-- Generate a new forward CLI migration at the owner's reviewed destination; never
-- replay/edit 20261022184736 or truncate accepted history. See controlled-upgrade docs.
begin;
set local lock_timeout='5s';
lock table public.clients,public.support_tickets,platform_private.provision_jobs,platform_private.managed_release_pins in share row exclusive mode;
do $$begin
 if current_user<>'postgres' or coalesce(current_setting('retrasell.reviewed_platform_target',true),'') !~ '^[a-z]{20}$'
 or coalesce(length(current_setting('retrasell.compatibility_review_reference',true)),0)<5
 or current_setting('retrasell.support_sender_compatibility',true) is distinct from 'approved'
 or current_setting('retrasell.reviewed_ticket_count',true) is distinct from (select count(*)::text from public.support_tickets)
 then raise exception 'Target-specific sender compatibility and accepted-history review required';end if;
 if to_regclass('platform_private.master_identity') is null then raise exception 'Platform only';end if;
end$$;
revoke all privileges on table public.support_tickets from anon,public;
revoke insert(client_id,client_name,subject,message) on public.support_tickets from anon,public;
revoke all privileges on sequence public.support_tickets_id_seq from anon,public;
drop policy if exists support_submission on public.support_tickets;
do $$begin
 if has_table_privilege('anon','public.support_tickets','INSERT') or has_any_column_privilege('anon','public.support_tickets','INSERT')
 or has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE') or has_sequence_privilege('anon','public.support_tickets_id_seq','SELECT') or has_sequence_privilege('anon','public.support_tickets_id_seq','UPDATE')
 or exists(select 1 from pg_policies where schemaname='public' and tablename='support_tickets' and cmd in('INSERT','ALL') and ('anon'=any(roles) or 'public'=any(roles))) then raise exception 'Anonymous Support remains open';end if;
end$$;
insert into public.operator_audit(actor_id,action,detail)values(null,'support_closure_target_adoption',jsonb_build_object('project_ref',current_setting('retrasell.reviewed_platform_target'),'reference',current_setting('retrasell.compatibility_review_reference'),'preserved_tickets',(select count(*) from public.support_tickets)));
commit;
