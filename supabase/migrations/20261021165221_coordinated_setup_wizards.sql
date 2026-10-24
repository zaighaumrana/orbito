BEGIN;
-- No customer credentials, files, free-form diagnostic text or installer journal
-- enter these records. RPCs use live canonical operator/session authorization.
CREATE TABLE platform_private.byo_setup_progress(
 client_id integer PRIMARY KEY REFERENCES public.clients(id),
 project_ref text NOT NULL CHECK(project_ref~'^[a-z]{20}$'),
 client_binding text NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 current_step integer NOT NULL DEFAULT 1 CHECK(current_step BETWEEN 1 AND 12),
 marks jsonb NOT NULL DEFAULT '{}',
 history jsonb NOT NULL DEFAULT '[]',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_private.byo_setup_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.byo_setup_progress FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_byo_progress(p_client integer,p_project_ref text,p_binding text DEFAULT NULL,p_revision bigint DEFAULT NULL,p_step integer DEFAULT NULL,p_mark text DEFAULT NULL,p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.clients; saved platform_private.byo_setup_progress; binding text; h jsonb; observed_at timestamptz; entry jsonb;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin']);
 SELECT * INTO c FROM public.clients WHERE id=p_client FOR UPDATE;
 IF NOT FOUND OR c.onboarding_version<>2 OR c.pairing_mode<>'byo' OR c.lifecycle_state='Archived' OR c.infrastructure_state IN ('destroyed','decommissioned')
  OR c.supabase_url IS DISTINCT FROM 'https://'||p_project_ref||'.supabase.co' OR p_project_ref IS NULL OR p_project_ref!~'^[a-z]{20}$'
 THEN RAISE EXCEPTION 'BYO target mismatch or unavailable' USING errcode='42501';END IF;
 IF EXISTS(SELECT 1 FROM platform_private.shop_credentials s WHERE s.client_id=c.id AND s.project_ref IS DISTINCT FROM p_project_ref) THEN RAISE EXCEPTION 'BYO credential target mismatch' USING errcode='42501';END IF;
 SELECT coalesce(s.client_binding,'orbito-client-'||c.id),s.health,s.verified_at INTO binding,h,observed_at FROM (SELECT 1) seed LEFT JOIN platform_private.shop_credentials s ON s.client_id=c.id;
 SELECT * INTO saved FROM platform_private.byo_setup_progress WHERE client_id=c.id FOR UPDATE;
 IF saved.client_id IS NOT NULL AND (saved.project_ref<>p_project_ref OR saved.client_binding<>binding) THEN RAISE EXCEPTION 'Progress pairing changed; review original target' USING errcode='40001';END IF;
 IF p_step IS NOT NULL THEN
  IF p_step NOT BETWEEN 1 AND 12 OR p_revision IS NULL OR p_revision<>coalesce(saved.revision,0) OR p_binding IS DISTINCT FROM binding THEN RAISE EXCEPTION 'Progress changed; refresh before retry' USING errcode='40001';END IF;
  IF p_mark IS NOT NULL AND p_mark NOT IN ('acknowledged','blocked','not_applicable') THEN RAISE EXCEPTION 'Invalid operator mark';END IF;
  IF p_mark='not_applicable' AND NOT(p_step IN(10,11) OR (p_step=12 AND NOT c.paper_resupply_enabled)) THEN RAISE EXCEPTION 'Step is required';END IF;
  IF p_category IS NOT NULL AND (p_mark IS DISTINCT FROM 'blocked' OR p_category NOT IN ('configuration','identity','release','mode','cli_unavailable','cli_authorization','history','provider','unknown_write','interrupted','lock','journal','prerequisites','internal')) THEN RAISE EXCEPTION 'Invalid diagnostic category';END IF;
  IF saved.client_id IS NULL THEN INSERT INTO platform_private.byo_setup_progress(client_id,project_ref,client_binding) VALUES(c.id,p_project_ref,binding) RETURNING * INTO saved;END IF;
  entry:=jsonb_build_object('actor',auth.uid(),'at',clock_timestamp(),'step',p_step,'mark',coalesce(p_mark,'viewed'),'category',p_category);
  UPDATE platform_private.byo_setup_progress SET current_step=p_step,revision=revision+1,
   marks=CASE WHEN p_mark IS NULL THEN marks ELSE marks||jsonb_build_object(p_step::text,jsonb_build_object('mark',p_mark,'category',p_category,'at',clock_timestamp())) END,
   history=(SELECT coalesce(jsonb_agg(v ORDER BY n),'[]') FROM jsonb_array_elements(saved.history||jsonb_build_array(entry)) WITH ORDINALITY a(v,n) WHERE n>jsonb_array_length(saved.history)+1-50),
   updated_at=clock_timestamp() WHERE client_id=c.id RETURNING * INTO saved;
  INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(c.id,auth.uid(),'byo_wizard_progress',entry-'actor');
 ELSIF p_binding IS NOT NULL OR p_revision IS NOT NULL OR p_mark IS NOT NULL OR p_category IS NOT NULL THEN RAISE EXCEPTION 'Invalid progress read';END IF;
 RETURN jsonb_build_object('client_id',c.id,'project_ref',p_project_ref,'client_binding',binding,'revision',coalesce(saved.revision,0),'current_step',coalesce(saved.current_step,1),'marks',coalesce(saved.marks,'{}'), 'history',coalesce(saved.history,'[]'),
  'observations',jsonb_build_object('observed_at',observed_at,'owner_active',observed_at IS NOT NULL AND coalesce(h->>'owner_account'='active',false),'onboarding_complete',observed_at IS NOT NULL AND coalesce(h->>'onboarding'='onboarding_complete',false),
   'backend_runtime_verified',observed_at IS NOT NULL AND coalesce((h->'checks') @> '{"migrations":true,"database_privileges":true,"rpc_privileges":true,"sequence_privileges":true,"private_config":true,"storage":true,"database_reachable":true,"bridge_configuration":true,"edge_functions":true,"runtime_configuration":true,"authentication":true}',false),
   'backend_runtime_failed',coalesce(h?'error',false) OR EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(h->'checks')='object' THEN h->'checks' ELSE '{}'::jsonb END) x WHERE x.key IN('migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication') AND x.value='false'::jsonb),
   'owner_conflict',coalesce(h->>'owner_account'='conflict',false),
   'support_failed',coalesce(public.platform_support_automation_status(c.id)->>'state' IN('attention','revoked'),false),
   'support_enabled',coalesce(public.platform_support_automation_status(c.id)->>'state'='enabled',false)));
END $$;
REVOKE ALL ON FUNCTION public.platform_byo_progress(integer,text,text,bigint,integer,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_byo_progress(integer,text,text,bigint,integer,text,text) TO authenticated;

-- Thin idempotent wrapper; canonical create validation/triggers remain unchanged.
CREATE TABLE platform_private.client_creation_receipts(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL, payload_sha256 text NOT NULL,
 client_id integer NOT NULL REFERENCES public.clients(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_private.client_creation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.client_creation_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.platform_create_client_once(p_request uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt platform_private.client_creation_receipts; result jsonb; fingerprint text;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin','portfolio_manager']);
 IF p_request IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Request and client fields required';END IF;
 fingerprint:=encode(extensions.digest(p_data::text,'sha256'),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-create:'||p_request::text,0));
 SELECT * INTO receipt FROM platform_private.client_creation_receipts WHERE request_id=p_request;
 IF receipt.request_id IS NOT NULL THEN
  IF receipt.actor_id<>auth.uid() OR receipt.payload_sha256<>fingerprint THEN RAISE EXCEPTION 'Creation request identity conflict' USING errcode='42501';END IF;
  SELECT platform_private.client_read(c,platform_private.operator_role()) INTO result FROM public.clients c WHERE c.id=receipt.client_id;
  RETURN result;
 END IF;
 result:=public.platform_save_client(NULL,p_data);
 INSERT INTO platform_private.client_creation_receipts(request_id,actor_id,payload_sha256,client_id) VALUES(p_request,auth.uid(),fingerprint,(result->>'id')::integer);
 INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES((result->>'id')::integer,auth.uid(),'client_created_once',jsonb_build_object('request_id',p_request));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.platform_create_client_once(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_create_client_once(uuid,jsonb) TO authenticated;
COMMIT;
