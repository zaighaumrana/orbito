-- Owner-approved closure for the empty Platform development environment
-- ukbhyerxshteyetwomqy. Abort if its compatibility precondition has changed.
begin;
set local lock_timeout = '5s';
-- Hold the emptiness precondition through revocation and verification.
lock table public.clients, public.support_tickets,
  platform_private.provision_jobs, platform_private.managed_release_pins
  in share row exclusive mode;
do $$
begin
  if exists(select 1 from public.clients)
     or exists(select 1 from public.support_tickets)
     or exists(select 1 from platform_private.provision_jobs)
     or exists(select 1 from platform_private.managed_release_pins)
  then
    raise exception 'Empty development environment required; review installed Support sender compatibility before closure';
  end if;
  perform set_config('retrasell.support_sender_compatibility','approved',true);
end $$;

do $$begin if current_setting('retrasell.support_sender_compatibility',true) is distinct from 'approved' then raise exception 'Installed Support sender compatibility approval required';end if;end$$;
REVOKE ALL PRIVILEGES ON TABLE public.support_tickets FROM anon,PUBLIC;
-- Table revocation alone is not sufficient for the observed column grants.
REVOKE INSERT(client_id,client_name,subject,message) ON public.support_tickets FROM anon,PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE public.support_tickets_id_seq FROM anon,PUBLIC;
DROP POLICY IF EXISTS support_submission ON public.support_tickets;
DO $$ BEGIN
  IF has_table_privilege('anon','public.support_tickets','INSERT')
     OR has_any_column_privilege('anon','public.support_tickets','INSERT')
     OR has_sequence_privilege('anon','public.support_tickets_id_seq','USAGE')
     OR has_sequence_privilege('anon','public.support_tickets_id_seq','SELECT')
     OR has_sequence_privilege('anon','public.support_tickets_id_seq','UPDATE')
     OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='support_tickets'
                  AND cmd IN ('INSERT','ALL') AND ('anon'=ANY(roles) OR 'public'=ANY(roles)))
  THEN RAISE EXCEPTION 'Anonymous Support access remains; investigate grants/policies';END IF;
END $$;
commit;
