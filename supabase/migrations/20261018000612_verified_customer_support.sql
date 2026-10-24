-- Verified customer Support v1. Forward-only additive migration; no hosted execution.
ALTER TABLE public.support_tickets ADD COLUMN support_revision bigint NOT NULL DEFAULT 1 CHECK(support_revision>0), ADD COLUMN support_resolution text CHECK(length(support_resolution)<=4000);
CREATE TABLE platform_private.support_ticket_credentials (
  key_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE,
  secret_id uuid REFERENCES vault.secrets(id),
  capability_checked_at timestamptz,
  install_started_at timestamptz,
  install_acknowledged_at timestamptz,
  source_id uuid NOT NULL REFERENCES public.bridge_sources(source_id),
  project_ref text NOT NULL CHECK(project_ref ~ '^[a-z]{20}$'),
  client_binding text NOT NULL CHECK(length(client_binding) BETWEEN 1 AND 200),
  secret_sha256 text NOT NULL UNIQUE CHECK(secret_sha256 ~ '^[a-f0-9]{64}$'),
  shop_public_api_key text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['ticket:create','ticket:read']
    CHECK(cardinality(scopes)>0 AND scopes<@ARRAY['ticket:create','ticket:read']),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  revoked_at timestamptz, not_after timestamptz,
  CHECK(NOT enabled OR revoked_at IS NULL)
);
COMMENT ON COLUMN platform_private.support_ticket_credentials.shop_public_api_key IS
  'Explicitly approved publishable/anon key only. Reject service/secret keys at Master enrollment.';
CREATE TABLE platform_private.support_ticket_context (
  ticket_id integer PRIMARY KEY REFERENCES public.support_tickets(id),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.bridge_sources(source_id),
  project_ref text NOT NULL, client_binding text NOT NULL,
  request_id uuid NOT NULL, actor_user_id uuid NOT NULL, actor_session_id uuid NOT NULL,
  actor_role text NOT NULL CHECK(actor_role IN ('Business Owner','Manager')),
  actor_employee_id integer, request_body jsonb NOT NULL CHECK(jsonb_typeof(request_body)='object'),
  category text NOT NULL CHECK(category IN ('technical','billing_question','account','other')),
  identity_assurance text NOT NULL DEFAULT 'shop_session_revalidated'
    CHECK(identity_assurance='shop_session_revalidated'),
  auth_checked_at timestamptz NOT NULL,
  UNIQUE(source_id,request_id)
);
-- actor_user_id/session_id belong to the recorded Shop project, NOT Platform Auth.
CREATE INDEX support_ticket_actor_scope ON platform_private.support_ticket_context(source_id,actor_user_id,ticket_id DESC);
CREATE TABLE platform_private.support_ticket_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id integer NOT NULL REFERENCES public.support_tickets(id),
  action text NOT NULL CHECK(action IN ('created','resolved')),
  actor_namespace text NOT NULL CHECK(actor_namespace IN ('shop','platform')),
  actor_user_id uuid NOT NULL, actor_project_ref text,
  customer_message text CHECK(customer_message IS NULL OR length(customer_message)<=4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX support_ticket_events_history ON platform_private.support_ticket_events(ticket_id,created_at,event_id);
CREATE TRIGGER support_ticket_events_immutable BEFORE UPDATE OR DELETE ON platform_private.support_ticket_events
  FOR EACH ROW EXECUTE FUNCTION platform_private.reject_mutation();
CREATE TABLE platform_private.support_ticket_budgets (
  bucket text NOT NULL, window_start timestamptz NOT NULL,
  used integer NOT NULL CHECK(used>0), PRIMARY KEY(bucket,window_start)
);
ALTER TABLE platform_private.support_ticket_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.support_ticket_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.support_ticket_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.support_ticket_credentials,platform_private.support_ticket_context,
  platform_private.support_ticket_events,platform_private.support_ticket_budgets
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.support_ticket_source(p_hash text,p_scope text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
     OR NOT coalesce(p_scope=ANY(ARRAY['ticket:create','ticket:read']),false)
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  SELECT jsonb_build_object('key_id',k.key_id,'source_id',k.source_id,'project_ref',k.project_ref,
       'client_binding',k.client_binding,'client_id',c.id,'client_name',c.name,
       'shop_public_api_key',k.shop_public_api_key) INTO result
  FROM platform_private.support_ticket_credentials k
  JOIN public.bridge_sources b ON b.source_id=k.source_id
  JOIN public.clients c ON c.id=b.client_id
  JOIN platform_private.shop_credentials sc ON sc.client_id=c.id
  WHERE k.secret_sha256=p_hash AND k.enabled AND k.revoked_at IS NULL
    AND (k.not_after IS NULL OR k.not_after>now()) AND p_scope=ANY(k.scopes)
    AND c.onboarding_version=2 AND c.lifecycle_state='Active'
    AND c.infrastructure_state NOT IN ('destroyed','decommissioned')
    AND c.supabase_url='https://'||k.project_ref||'.supabase.co'
    AND NOT EXISTS(SELECT 1 FROM platform_private.provision_jobs j WHERE j.client_id=c.id AND j.state<>'complete')
    AND sc.project_ref=k.project_ref AND sc.client_binding=k.client_binding
    AND b.client_binding=k.client_binding;
  -- Existing usage-delivery enabled is not substituted for this separate key scope.
  IF result IS NULL THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.platform_support_ticket_source(p_hash text,p_action text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_action='create' THEN RETURN platform_private.support_ticket_source(p_hash,'ticket:create');
  ELSIF p_action IN ('get','list') THEN RETURN platform_private.support_ticket_source(p_hash,'ticket:read');
  ELSE RAISE EXCEPTION 'Unsupported action' USING errcode='22023'; END IF;
END $$;

-- This check validates a TRUSTED HANDLER result. It cannot itself contact Shop
-- Auth or verify its JWT. The Edge handler MUST independently verify Auth + the
-- registered Shop's actor-context RPC and must never accept actor JSON from a body.
CREATE FUNCTION platform_private.support_ticket_check_actor(p_source jsonb,p_actor jsonb,p_verified_at timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE uid uuid; sid uuid;
BEGIN
  IF p_actor IS NULL OR jsonb_typeof(p_actor) IS DISTINCT FROM 'object'
     OR p_verified_at IS NULL OR p_verified_at<clock_timestamp()-interval '15 seconds'
     OR p_verified_at>clock_timestamp()+interval '2 seconds'
     OR p_actor->>'source_id' IS DISTINCT FROM p_source->>'source_id'
     OR p_actor->>'client_binding' IS DISTINCT FROM p_source->>'client_binding'
     OR p_actor->>'platform_client_id' IS DISTINCT FROM p_source->>'client_id'
     OR NOT coalesce(p_actor->>'role'=ANY(ARRAY['Business Owner','Manager']),false)
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  BEGIN uid:=(p_actor->>'auth_user_id')::uuid;sid:=(p_actor->>'session_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END;
  IF uid IS NULL OR sid IS NULL THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501';END IF;
END $$;

CREATE FUNCTION public.platform_support_ticket_create(p_hash text,p_assertions jsonb,p_request uuid,
  p_fields jsonb,p_actor jsonb,p_verified_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;k platform_private.support_ticket_credentials;old platform_private.support_ticket_context;
  cid integer;tid integer;public_ticket uuid;budget integer;bucket_key text;limit_value integer;
BEGIN
  s:=platform_private.support_ticket_source(p_hash,'ticket:create');cid:=(s->>'client_id')::integer;
  -- Match the existing client-first lock order. All enrollment/re-pair writers
  -- for this feature must follow the same ordering. No network calls in SQL.
  PERFORM 1 FROM public.clients WHERE id=cid FOR UPDATE;
  SELECT * INTO k FROM platform_private.support_ticket_credentials
    WHERE key_id=(s->>'key_id')::uuid FOR UPDATE;
  s:=platform_private.support_ticket_source(p_hash,'ticket:create');
  PERFORM platform_private.support_ticket_check_actor(s,p_actor,p_verified_at);
  IF p_assertions IS NULL OR p_assertions->>'source_id' IS DISTINCT FROM s->>'source_id'
     OR p_assertions->>'project_ref' IS DISTINCT FROM s->>'project_ref'
     OR p_assertions->>'client_binding' IS DISTINCT FROM s->>'client_binding'
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501';END IF;
  IF p_request IS NULL OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'Invalid ticket fields' USING errcode='22023';END IF;
  IF p_fields-ARRAY['subject','category','message']<>'{}'::jsonb
     OR jsonb_typeof(p_fields->'subject') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_fields->'message') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_fields->'category') IS DISTINCT FROM 'string'
     OR length(p_fields->>'subject') NOT BETWEEN 1 AND 160 OR length(trim(p_fields->>'subject'))<1
     OR length(p_fields->>'message') NOT BETWEEN 1 AND 4000 OR length(trim(p_fields->>'message'))<1
     OR p_fields->>'category' NOT IN ('technical','billing_question','account','other')
  THEN RAISE EXCEPTION 'Invalid ticket fields' USING errcode='22023';END IF;
  SELECT * INTO old FROM platform_private.support_ticket_context
    WHERE source_id=(s->>'source_id')::uuid AND request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF old.request_body IS DISTINCT FROM p_fields OR old.actor_user_id IS DISTINCT FROM (p_actor->>'auth_user_id')::uuid
    THEN RAISE EXCEPTION 'Ticket request conflict' USING errcode='23505';END IF;
    RETURN jsonb_build_object('accepted',true,'ticket_id',old.public_id,'status',(SELECT status FROM public.support_tickets WHERE id=old.ticket_id));
  END IF;
  -- V1 operational caps: 50 accepted creates/source/hour, 10/actor/hour. Replays are free.
  FOREACH bucket_key IN ARRAY ARRAY['source:'||(s->>'source_id'),
      'actor:'||(s->>'source_id')||':'||(p_actor->>'auth_user_id')] LOOP
    limit_value:=CASE WHEN bucket_key LIKE 'source:%' THEN 50 ELSE 10 END;
    budget:=NULL;
    INSERT INTO platform_private.support_ticket_budgets VALUES(bucket_key,date_trunc('hour',now()),1)
      ON CONFLICT(bucket,window_start) DO UPDATE SET used=platform_private.support_ticket_budgets.used+1
      WHERE platform_private.support_ticket_budgets.used<limit_value RETURNING used INTO budget;
    IF budget IS NULL THEN RAISE EXCEPTION 'Support quota exceeded' USING errcode='PT429';END IF;
  END LOOP;
  INSERT INTO public.support_tickets(client_id,client_name,subject,message)
    VALUES(cid,s->>'client_name',p_fields->>'subject',p_fields->>'message') RETURNING id INTO tid;
  INSERT INTO platform_private.support_ticket_context(ticket_id,source_id,project_ref,client_binding,
      request_id,actor_user_id,actor_session_id,actor_role,actor_employee_id,request_body,category,auth_checked_at)
    VALUES(tid,(s->>'source_id')::uuid,s->>'project_ref',s->>'client_binding',p_request,
      (p_actor->>'auth_user_id')::uuid,(p_actor->>'session_id')::uuid,p_actor->>'role',
      (p_actor->>'employee_id')::integer,p_fields,p_fields->>'category',p_verified_at)
    RETURNING public_id INTO public_ticket;
  INSERT INTO platform_private.support_ticket_events(ticket_id,action,actor_namespace,actor_user_id,actor_project_ref)
    VALUES(tid,'created','shop',(p_actor->>'auth_user_id')::uuid,s->>'project_ref');
  RETURN jsonb_build_object('accepted',true,'ticket_id',public_ticket,'status','Open');
END $$;

-- Get/list use the same revalidated actor. p_ticket=NULL means list; otherwise
-- one opaque-ID lookup. The handler maps an empty get result to generic 404.
CREATE FUNCTION public.platform_support_ticket_read(p_hash text,p_actor jsonb,p_verified_at timestamptz,
  p_ticket uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;rows jsonb;cid integer;
BEGIN
  s:=platform_private.support_ticket_source(p_hash,'ticket:read');
  cid:=(s->>'client_id')::integer;
  -- Shared reads coexist. Client-first SHARE still fences every client writer
  -- and credential revocation until this short SQL-only projection completes.
  -- Never upgrade these locks or perform network I/O within this transaction.
  PERFORM 1 FROM public.clients WHERE id=cid FOR SHARE;
  PERFORM 1 FROM platform_private.support_ticket_credentials WHERE key_id=(s->>'key_id')::uuid FOR SHARE;
  s:=platform_private.support_ticket_source(p_hash,'ticket:read');
  PERFORM platform_private.support_ticket_check_actor(s,p_actor,p_verified_at);
  IF p_offset IS NULL OR p_offset<0 OR p_offset>5000 THEN RAISE EXCEPTION 'Invalid page' USING errcode='22023';END IF;
  SELECT coalesce(jsonb_agg(q.row ORDER BY q.internal_id DESC),'[]'::jsonb) INTO rows FROM (
    SELECT t.id AS internal_id,jsonb_build_object('ticket_id',x.public_id,'subject',t.subject,
      'category',x.category,'message',t.message,'status',t.status,'created_at',t.created_at,
      'resolved_at',t.resolved_at,'revision',t.support_revision,'resolution',(
        SELECT e.customer_message FROM platform_private.support_ticket_events e
        WHERE e.ticket_id=t.id AND e.action='resolved' ORDER BY e.created_at DESC,e.event_id DESC LIMIT 1)) AS row
    FROM platform_private.support_ticket_context x JOIN public.support_tickets t ON t.id=x.ticket_id
    WHERE x.source_id=(s->>'source_id')::uuid AND x.project_ref=s->>'project_ref'
      AND x.client_binding=s->>'client_binding' AND t.client_id=(s->>'client_id')::integer
      AND (p_ticket IS NULL OR x.public_id=p_ticket)
      AND (p_actor->>'role'='Business Owner' OR x.actor_user_id=(p_actor->>'auth_user_id')::uuid)
    ORDER BY t.id DESC LIMIT 50 OFFSET p_offset
  ) q;
  RETURN rows;
END $$;

-- Explicitly counter current public-schema defaults. Private helpers are never
-- externally executable; only trusted backend wrappers receive service access.
REVOKE ALL ON FUNCTION platform_private.support_ticket_source(text,text),
 platform_private.support_ticket_check_actor(jsonb,jsonb,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_support_ticket_source(text,text),
 public.platform_support_ticket_create(text,jsonb,uuid,jsonb,jsonb,timestamptz),
 public.platform_support_ticket_read(text,jsonb,timestamptz,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_ticket_source(text,text),
 public.platform_support_ticket_create(text,jsonb,uuid,jsonb,jsonb,timestamptz),
 public.platform_support_ticket_read(text,jsonb,timestamptz,uuid,integer) TO service_role;

-- Immutable provenance. Resolution revisions belong to the authoritative ticket.
CREATE TRIGGER support_ticket_context_immutable BEFORE UPDATE OR DELETE ON platform_private.support_ticket_context
 FOR EACH ROW EXECUTE FUNCTION platform_private.reject_mutation();

CREATE FUNCTION public.platform_support_ticket_page(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin','portfolio_manager']);
 IF p_offset IS NULL OR p_offset<0 OR p_offset>5000 THEN RAISE EXCEPTION 'Invalid page' USING errcode='22023';END IF;
 SELECT coalesce(jsonb_agg(q.row ORDER BY q.id DESC),'[]') INTO rows FROM (
  SELECT t.id,jsonb_build_object('id',t.id,'client_id',t.client_id,'client_name',t.client_name,
   'subject',t.subject,'message',t.message,'category',x.category,'status',t.status,
   'created_at',t.created_at,'resolved_at',t.resolved_at,'revision',t.support_revision,
   'resolution',t.support_resolution,'verified',x.ticket_id IS NOT NULL,
   'project_ref',x.project_ref,'source_id',x.source_id,'requester_role',x.actor_role,
   'requester_id',x.actor_user_id,'ticket_id',x.public_id,'history',(
    SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.action,'created_at',e.created_at,
     'actor_namespace',e.actor_namespace,'message',e.customer_message) ORDER BY e.created_at,e.event_id),'[]')
    FROM platform_private.support_ticket_events e WHERE e.ticket_id=t.id)) AS row
  FROM public.support_tickets t LEFT JOIN platform_private.support_ticket_context x ON x.ticket_id=t.id
  ORDER BY t.id DESC LIMIT 50 OFFSET p_offset
 ) q;
 RETURN jsonb_build_object('rows',rows,'offset',p_offset,'has_more',jsonb_array_length(rows)=50);
END $$;

CREATE FUNCTION public.platform_support_ticket_resolve(p_ticket integer,p_revision bigint,p_resolution text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.support_tickets;cid integer;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin','portfolio_manager']);
 IF p_resolution IS NULL OR length(p_resolution)>4000 THEN RAISE EXCEPTION 'Invalid resolution' USING errcode='22023';END IF;
 SELECT client_id INTO cid FROM public.support_tickets WHERE id=p_ticket;
 IF cid IS NOT NULL THEN PERFORM 1 FROM public.clients WHERE id=cid FOR UPDATE;END IF;
 SELECT * INTO t FROM public.support_tickets WHERE id=p_ticket FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket unavailable' USING errcode='PT404';END IF;
 -- An identical retry may carry the previous revision after a lost response.
 IF t.status='Resolved' AND coalesce(t.support_resolution,'')=p_resolution
  AND p_revision IN (t.support_revision,t.support_revision-1) THEN
  RETURN jsonb_build_object('resolved',true,'revision',t.support_revision);
 END IF;
 IF p_revision IS DISTINCT FROM t.support_revision OR t.status<>'Open' THEN
  RAISE EXCEPTION 'Ticket changed; reload' USING errcode='PT409';
 END IF;
 UPDATE public.support_tickets SET status='Resolved',resolved_at=clock_timestamp(),
  support_revision=support_revision+1,support_resolution=p_resolution WHERE id=p_ticket;
 INSERT INTO platform_private.support_ticket_events(ticket_id,action,actor_namespace,actor_user_id,customer_message)
  VALUES(p_ticket,'resolved','platform',auth.uid(),p_resolution);
 INSERT INTO public.operator_audit(client_id,actor_id,action,detail)
  VALUES(cid,auth.uid(),'support_ticket_resolved',jsonb_build_object('ticket_id',p_ticket,'revision',t.support_revision+1));
 RETURN jsonb_build_object('resolved',true,'revision',t.support_revision+1);
END $$;
CREATE OR REPLACE FUNCTION public.platform_resolve_ticket(p_ticket integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.support_tickets;cid integer;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin','portfolio_manager']);
 SELECT client_id INTO cid FROM public.support_tickets WHERE id=p_ticket;
 IF cid IS NOT NULL THEN PERFORM 1 FROM public.clients WHERE id=cid FOR UPDATE;END IF;
 SELECT * INTO t FROM public.support_tickets WHERE id=p_ticket FOR UPDATE;
 IF t.status='Resolved' THEN RETURN;END IF;
 PERFORM public.platform_support_ticket_resolve(p_ticket,t.support_revision,'');
END $$;
-- All browser resolution writes pass through the audited RPC, including old callers.
REVOKE UPDATE ON public.support_tickets FROM authenticated;
REVOKE UPDATE(status,resolved_at) ON public.support_tickets FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_support_ticket_page(integer),
 public.platform_support_ticket_resolve(integer,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_support_ticket_page(integer),
 public.platform_support_ticket_resolve(integer,bigint,text) TO authenticated;

-- Exact-pairing enrollment, retry and recovery live in Vault; never browser projections.
-- The service boundary verifies Auth first and supplies the canonical Master/session.
CREATE FUNCTION public.platform_support_credential_command(p_actor uuid,p_session uuid,p_client integer,
 p_request uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.clients;sc platform_private.shop_credentials;b public.bridge_sources;
 k platform_private.support_ticket_credentials;plain text;v uuid;fingerprint text;scopes text[];
BEGIN
 PERFORM platform_private.team_master(p_actor);
 IF NOT platform_private.session_live(p_actor,p_session) THEN RAISE EXCEPTION 'Live Master required' USING errcode='42501';END IF;
 SELECT * INTO c FROM public.clients WHERE id=p_client FOR UPDATE;
 SELECT * INTO sc FROM platform_private.shop_credentials WHERE client_id=p_client;
 SELECT * INTO b FROM public.bridge_sources WHERE client_id=p_client;
 IF c.id IS NULL OR (p_action NOT IN ('revoke','status') AND c.lifecycle_state<>'Active') OR c.onboarding_version<>2
  OR c.infrastructure_state IN ('destroyed','decommissioned') OR sc.client_id IS NULL OR b.source_id IS NULL
  OR sc.client_binding<>b.client_binding OR c.supabase_url<>'https://'||sc.project_ref||'.supabase.co'
  OR EXISTS(SELECT 1 FROM platform_private.provision_jobs j WHERE j.client_id=p_client AND j.state<>'complete')
 THEN RAISE EXCEPTION 'Eligible paired Shop required' USING errcode='42501';END IF;
 IF p_request IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
  OR p_action NOT IN ('prepare','material','enable','revoke','status','installation_started','installation_acknowledged') THEN
  RAISE EXCEPTION 'Invalid credential command' USING errcode='22023';END IF;
 SELECT * INTO k FROM platform_private.support_ticket_credentials WHERE enrollment_id=p_request FOR UPDATE;
 IF k.key_id IS NOT NULL AND (k.source_id<>b.source_id OR k.project_ref<>sc.project_ref OR k.client_binding<>sc.client_binding)
 THEN RAISE EXCEPTION 'Enrollment binding changed' USING errcode='PT409';END IF;
 IF p_action='prepare' THEN
  IF p_data-ARRAY['shop_public_api_key','scopes','project_ref','source_id','client_binding','secret_sha256']<>'{}'
   OR p_data->>'project_ref' IS DISTINCT FROM sc.project_ref OR p_data->>'source_id' IS DISTINCT FROM b.source_id::text
   OR p_data->>'client_binding' IS DISTINCT FROM sc.client_binding
   OR jsonb_typeof(p_data->'shop_public_api_key') IS DISTINCT FROM 'string'
   OR length(p_data->>'shop_public_api_key') NOT BETWEEN 20 AND 4096
   OR jsonb_typeof(p_data->'scopes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exact approved enrollment required' USING errcode='22023';END IF;
  SELECT array_agg(value ORDER BY value) INTO scopes FROM jsonb_array_elements_text(p_data->'scopes');
  IF scopes IS NULL OR cardinality(scopes) NOT BETWEEN 1 AND 2 OR NOT scopes<@ARRAY['ticket:create','ticket:read'] THEN RAISE EXCEPTION 'Invalid scopes' USING errcode='22023';END IF;
  IF k.key_id IS NOT NULL THEN
   IF k.shop_public_api_key<>p_data->>'shop_public_api_key' OR k.scopes<>scopes OR (c.pairing_mode='byo' AND k.secret_sha256 IS DISTINCT FROM p_data->>'secret_sha256') THEN RAISE EXCEPTION 'Enrollment conflict' USING errcode='PT409';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM platform_private.support_ticket_credentials WHERE source_id=b.source_id AND NOT enabled AND revoked_at IS NULL)
   THEN RAISE EXCEPTION 'Recover or revoke pending enrollment' USING errcode='PT409';END IF;
   IF c.pairing_mode='byo' THEN
    IF coalesce(p_data->>'secret_sha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'BYO hash required' USING errcode='22023';END IF;
   ELSIF p_data ? 'secret_sha256' THEN RAISE EXCEPTION 'Managed key is server generated' USING errcode='22023';END IF;
   plain:=encode(extensions.gen_random_bytes(32),'hex');
   fingerprint:=CASE WHEN c.pairing_mode='byo' THEN p_data->>'secret_sha256' ELSE encode(extensions.digest(plain,'sha256'),'hex') END;
   IF EXISTS(SELECT 1 FROM platform_private.source_credentials WHERE secret_sha256=fingerprint)
    OR EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE id=sc.bridge_call_secret_id AND encode(extensions.digest(decrypted_secret,'sha256'),'hex')=fingerprint)
   THEN RAISE EXCEPTION 'Credential collision';END IF;
   IF c.pairing_mode='managed' THEN v:=vault.create_secret(plain);END IF;
   INSERT INTO platform_private.support_ticket_credentials(enrollment_id,secret_id,source_id,project_ref,client_binding,secret_sha256,shop_public_api_key,scopes,created_by)
    VALUES(p_request,v,b.source_id,sc.project_ref,sc.client_binding,fingerprint,p_data->>'shop_public_api_key',scopes,p_actor) RETURNING * INTO k;
   INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_credential_prepared',jsonb_build_object('key_id',k.key_id,'request_id',p_request));
  END IF;
 ELSIF k.key_id IS NULL THEN RAISE EXCEPTION 'Enrollment unavailable' USING errcode='PT404';
 ELSIF p_action IN ('installation_started','installation_acknowledged') THEN
  IF k.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Credential revoked' USING errcode='42501';END IF;
  IF p_action='installation_started' AND k.install_started_at IS NULL THEN
   UPDATE platform_private.support_ticket_credentials SET install_started_at=clock_timestamp() WHERE key_id=k.key_id;
   INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_install_dispatched',jsonb_build_object('key_id',k.key_id,'request_id',p_request));
  ELSIF p_action='installation_acknowledged' AND k.install_acknowledged_at IS NULL THEN
   IF k.install_started_at IS NULL THEN RAISE EXCEPTION 'Installation not dispatched' USING errcode='42501';END IF;
   UPDATE platform_private.support_ticket_credentials SET install_acknowledged_at=clock_timestamp() WHERE key_id=k.key_id;
   INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_install_acknowledged',jsonb_build_object('key_id',k.key_id,'request_id',p_request));
  END IF;
 ELSIF p_action='revoke' THEN
  IF k.revoked_at IS NULL THEN
   UPDATE platform_private.support_ticket_credentials SET enabled=false,revoked_at=clock_timestamp() WHERE key_id=k.key_id;
   INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_credential_revoked',jsonb_build_object('key_id',k.key_id));
  END IF;
 ELSIF p_action='enable' THEN
  IF k.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Credential revoked' USING errcode='42501';END IF;
  IF NOT k.enabled THEN
   -- Only the trusted enrollment handler sends this after authenticated capability proof.
   IF p_data->>'capability' IS DISTINCT FROM 'retrasell-support-v1' THEN RAISE EXCEPTION 'Capability verification required' USING errcode='42501';END IF;
   UPDATE platform_private.support_ticket_credentials SET enabled=false,revoked_at=clock_timestamp()
    WHERE source_id=b.source_id AND key_id<>k.key_id AND revoked_at IS NULL;
   UPDATE platform_private.support_ticket_credentials SET enabled=true,capability_checked_at=clock_timestamp() WHERE key_id=k.key_id;
   INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_credential_enabled',jsonb_build_object('key_id',k.key_id));
  END IF;
 END IF;
 SELECT * INTO k FROM platform_private.support_ticket_credentials WHERE key_id=k.key_id;
 IF p_action='material' AND k.revoked_at IS NULL THEN
  SELECT decrypted_secret INTO plain FROM vault.decrypted_secrets WHERE id=k.secret_id;
  RETURN jsonb_build_object('secret',plain,'secret_sha256',k.secret_sha256,'project_ref',k.project_ref,'source_id',k.source_id,
   'client_binding',k.client_binding,'client_id',p_client,'shop_public_api_key',k.shop_public_api_key,'pairing_mode',c.pairing_mode);
 END IF;
 RETURN jsonb_build_object('request_id',p_request,'key_id',k.key_id,'enabled',k.enabled,'revoked',k.revoked_at IS NOT NULL,'project_ref',k.project_ref,'installation_state',CASE WHEN k.enabled THEN 'enabled' WHEN k.install_acknowledged_at IS NOT NULL THEN 'installed_unverified' WHEN k.install_started_at IS NOT NULL THEN 'uncertain_or_pending' ELSE 'prepared' END);
END $$;
REVOKE ALL ON FUNCTION public.platform_support_credential_command(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_credential_command(uuid,uuid,integer,uuid,text,jsonb) TO service_role;

-- A pairing change permanently invalidates both prepared and enabled credentials.
CREATE FUNCTION platform_private.support_pairing_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid integer;
BEGIN
 cid:=old.client_id;
 IF to_jsonb(new)->>'client_binding' IS DISTINCT FROM to_jsonb(old)->>'client_binding'
  OR to_jsonb(new)->>'project_ref' IS DISTINCT FROM to_jsonb(old)->>'project_ref'
  OR to_jsonb(new)->>'source_id' IS DISTINCT FROM to_jsonb(old)->>'source_id'
  OR new.client_id IS DISTINCT FROM old.client_id THEN
  UPDATE platform_private.support_ticket_credentials k SET enabled=false,revoked_at=clock_timestamp()
   WHERE k.source_id IN (SELECT source_id FROM public.bridge_sources WHERE client_id=cid) AND k.revoked_at IS NULL;
  INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(cid,auth.uid(),'support_pairing_invalidated','{}');
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION platform_private.support_pairing_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER support_shop_pairing_changed BEFORE UPDATE ON platform_private.shop_credentials
 FOR EACH ROW EXECUTE FUNCTION platform_private.support_pairing_changed();
CREATE TRIGGER support_source_pairing_changed BEFORE UPDATE ON public.bridge_sources
 FOR EACH ROW EXECUTE FUNCTION platform_private.support_pairing_changed();
