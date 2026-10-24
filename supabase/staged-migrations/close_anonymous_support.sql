-- STAGED: promote with a new CLI migration only after deployed-sender compatibility approval.
-- Not discovered by db push. No hosted execution in this implementation task.
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
