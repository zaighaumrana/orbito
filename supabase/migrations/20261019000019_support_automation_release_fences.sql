BEGIN;
CREATE TABLE platform_private.managed_release_pins(
 request_id uuid PRIMARY KEY REFERENCES platform_private.provision_jobs(request_id),
 release_id text NOT NULL,release_sha256 text NOT NULL CHECK(release_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_private.managed_release_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.managed_release_pins FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.platform_managed_release_pin(p_request uuid,p_release text,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j platform_private.provision_jobs;r platform_private.managed_release_pins;
BEGIN
 PERFORM 1 FROM public.clients WHERE id=(SELECT client_id FROM platform_private.provision_jobs WHERE request_id=p_request) FOR UPDATE;
 SELECT * INTO j FROM platform_private.provision_jobs WHERE request_id=p_request FOR UPDATE;
 IF j.state IS DISTINCT FROM 'running' OR j.action<>'managed-setup' THEN RAISE EXCEPTION 'Running managed job required' USING errcode='42501';END IF;
 SELECT * INTO r FROM platform_private.managed_release_pins WHERE request_id=p_request;
 IF r.request_id IS NULL THEN
  -- Work begun before pins existed always retains the frozen accepted release.
  IF EXISTS(SELECT 1 FROM platform_private.provision_stages WHERE request_id=p_request) THEN
   p_release:='accepted-v1';p_sha256:='7f8e4cd5614a4b19e155f5114d49517dddb6c9c2ef7d62a2bc71e3927d97c940';
  END IF;
  IF p_release NOT IN ('accepted-v1','support-v2') OR p_sha256!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Approved release required';END IF;
  INSERT INTO platform_private.managed_release_pins VALUES(p_request,p_release,p_sha256,now()) RETURNING * INTO r;
  INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(j.client_id,j.actor_id,'managed_release_pinned',jsonb_build_object('request_id',p_request,'release',p_release,'sha256',p_sha256));
 END IF;
 RETURN jsonb_build_object('release_id',r.release_id,'sha256',r.release_sha256);
END $$;
REVOKE ALL ON FUNCTION public.platform_managed_release_pin(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_managed_release_pin(uuid,text,text) TO service_role;

CREATE TABLE platform_private.support_automation(
 client_id integer PRIMARY KEY REFERENCES public.clients(id),
 provision_request uuid NOT NULL REFERENCES platform_private.provision_jobs(request_id),
 enrollment_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 project_ref text NOT NULL,source_id uuid NOT NULL,client_binding text NOT NULL,
 state text NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','preparing','installing','verifying','enabled','attention','revoked')),
 reason text NOT NULL DEFAULT 'prerequisites',release_sha256 text,updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_private.support_automation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.support_automation FROM PUBLIC,anon,authenticated,service_role;

-- All manual and automatic installations share this permanent dispatch fence.
-- A timed-out external request is never assumed cancelled by a lease expiry.
CREATE TABLE platform_private.support_install_fences(
 client_id integer PRIMARY KEY REFERENCES public.clients(id),enrollment_id uuid NOT NULL,
 attempt_id uuid NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),acknowledged_at timestamptz
);
ALTER TABLE platform_private.support_install_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.support_install_fences FROM PUBLIC,anon,authenticated,service_role;
-- Preserve uncertainty from workers dispatched before this forward migration.
-- Even a subsequently revoked key can still have an outstanding provider write.
INSERT INTO platform_private.support_install_fences(client_id,enrollment_id,attempt_id,started_at)
 SELECT DISTINCT ON (b.client_id) b.client_id,k.enrollment_id,gen_random_uuid(),k.install_started_at
 FROM platform_private.support_ticket_credentials k JOIN public.bridge_sources b ON b.source_id=k.source_id
 WHERE k.install_started_at IS NOT NULL AND k.install_acknowledged_at IS NULL
 ORDER BY b.client_id,k.install_started_at;
ALTER FUNCTION public.platform_support_credential_command(uuid,uuid,integer,uuid,text,jsonb)
 RENAME TO platform_support_credential_command_v1;
REVOKE ALL ON FUNCTION public.platform_support_credential_command_v1(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.platform_support_credential_command(p_actor uuid,p_session uuid,p_client integer,p_request uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f platform_private.support_install_fences;r jsonb;attempt uuid;
BEGIN
 PERFORM platform_private.team_master(p_actor);
 IF NOT platform_private.session_live(p_actor,p_session) THEN RAISE EXCEPTION 'Live Master required' USING errcode='42501';END IF;
 PERFORM 1 FROM public.clients WHERE id=p_client FOR UPDATE;
 SELECT * INTO f FROM platform_private.support_install_fences WHERE client_id=p_client FOR UPDATE;
 IF f.client_id IS NOT NULL AND f.acknowledged_at IS NULL AND (p_action='installation_started' OR (p_action='prepare' AND p_request<>f.enrollment_id)) THEN
  RAISE EXCEPTION 'External install unresolved; verify original request or reconcile provider completion' USING errcode='PT409';
 END IF;
 IF p_action='installation_reconciled' THEN
  IF f.enrollment_id IS DISTINCT FROM p_request OR f.acknowledged_at IS NOT NULL
   OR p_data-ARRAY['provider_reference','reason','confirmed']<>'{}'
   OR p_data->>'confirmed' IS DISTINCT FROM 'true'
   OR length(trim(coalesce(p_data->>'provider_reference',''))) NOT BETWEEN 5 AND 200
   OR length(trim(coalesce(p_data->>'reason',''))) NOT BETWEEN 20 AND 500
  THEN RAISE EXCEPTION 'Exact unresolved dispatch and confirmed provider completion required' USING errcode='PT409';END IF;
  -- Status revalidates the exact live pairing without reviving a revoked key.
  r:=public.platform_support_credential_command_v1(p_actor,p_session,p_client,p_request,'status','{}');
  UPDATE platform_private.support_ticket_credentials k SET install_acknowledged_at=now()
   FROM public.bridge_sources b WHERE b.source_id=k.source_id AND b.client_id=p_client
   AND k.install_started_at IS NOT NULL AND k.install_acknowledged_at IS NULL;
  UPDATE platform_private.support_install_fences SET acknowledged_at=now() WHERE client_id=p_client;
  INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_provider_completion_reconciled',jsonb_build_object('request_id',p_request,'provider_reference',p_data->>'provider_reference','reason',p_data->>'reason'));
  RETURN r;
 ELSIF p_action='installation_started' THEN
  IF EXISTS(SELECT 1 FROM platform_private.support_ticket_credentials WHERE enrollment_id=p_request AND install_acknowledged_at IS NOT NULL AND revoked_at IS NULL) THEN
   RETURN jsonb_build_object('dispatch',false,'installed',true);
  END IF;
  attempt:=(p_data->>'attempt_id')::uuid;
  IF attempt IS NULL OR p_data-ARRAY['attempt_id']<>'{}' THEN RAISE EXCEPTION 'Dispatch attempt required' USING errcode='22023';END IF;
  r:=public.platform_support_credential_command_v1(p_actor,p_session,p_client,p_request,p_action,'{}');
  INSERT INTO platform_private.support_install_fences(client_id,enrollment_id,attempt_id) VALUES(p_client,p_request,attempt)
   ON CONFLICT(client_id) DO UPDATE SET enrollment_id=p_request,attempt_id=attempt,started_at=now(),acknowledged_at=NULL;
  RETURN r;
 ELSIF p_action='installation_acknowledged' THEN
  IF f.enrollment_id IS DISTINCT FROM p_request OR f.attempt_id IS DISTINCT FROM (p_data->>'attempt_id')::uuid THEN RAISE EXCEPTION 'Exact dispatch acknowledgement required' USING errcode='PT409';END IF;
  r:=public.platform_support_credential_command_v1(p_actor,p_session,p_client,p_request,p_action,'{}');
  UPDATE platform_private.support_install_fences SET acknowledged_at=now() WHERE client_id=p_client;
  RETURN r;
 END IF;
 -- Rotation is also fenced if a late write could overwrite the active key.
 RETURN public.platform_support_credential_command_v1(p_actor,p_session,p_client,p_request,p_action,p_data);
END $$;
REVOKE ALL ON FUNCTION public.platform_support_credential_command(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_credential_command(uuid,uuid,integer,uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.platform_support_automation_command(p_actor uuid,p_session uuid,p_client integer,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.clients;s platform_private.shop_credentials;b public.bridge_sources;
 a platform_private.support_automation;j uuid;k platform_private.support_ticket_credentials;
 ready boolean;
BEGIN
 PERFORM platform_private.team_master(p_actor);
 IF NOT platform_private.session_live(p_actor,p_session) THEN RAISE EXCEPTION 'Live Master required' USING errcode='42501';END IF;
 SELECT * INTO c FROM public.clients WHERE id=p_client FOR UPDATE;
 SELECT * INTO s FROM platform_private.shop_credentials WHERE client_id=p_client;
 SELECT * INTO b FROM public.bridge_sources WHERE client_id=p_client;
 IF c.id IS NULL OR c.pairing_mode<>'managed' OR c.onboarding_version<>2 OR c.lifecycle_state='Archived'
  OR c.infrastructure_state IN ('destroyed','decommissioned') OR s.client_id IS NULL OR b.source_id IS NULL
  OR c.supabase_url<>'https://'||s.project_ref||'.supabase.co' OR s.client_binding<>b.client_binding
 THEN RAISE EXCEPTION 'Exact managed pairing required' USING errcode='42501';END IF;
 SELECT request_id INTO j FROM platform_private.provision_jobs WHERE client_id=p_client AND state='complete' AND action IN ('managed-setup','bootstrap-shop','onboarding-status') ORDER BY created_at DESC LIMIT 1;
 IF j IS NULL THEN RETURN jsonb_build_object('state','waiting','reason','base_provisioning');END IF;
 INSERT INTO platform_private.support_automation(client_id,provision_request,project_ref,source_id,client_binding)
  VALUES(p_client,j,s.project_ref,b.source_id,b.client_binding) ON CONFLICT(client_id) DO NOTHING;
 SELECT * INTO a FROM platform_private.support_automation WHERE client_id=p_client FOR UPDATE;
 IF a.project_ref<>s.project_ref OR a.source_id<>b.source_id OR a.client_binding<>s.client_binding THEN
  UPDATE platform_private.support_automation SET state='revoked',reason='pairing_changed',updated_at=now() WHERE client_id=p_client;
  RETURN jsonb_build_object('state','revoked','reason','pairing_changed');
 END IF;
 ready:=c.lifecycle_state='Active' AND b.enabled AND s.health->>'owner_setup'='owner_active' AND s.health->>'owner_account'='active'
  AND s.health->>'onboarding'='onboarding_complete' AND s.health->>'infrastructure'='ready'
  AND NOT EXISTS(SELECT 1 FROM platform_private.provision_jobs WHERE client_id=p_client AND state<>'complete');
 SELECT * INTO k FROM platform_private.support_ticket_credentials WHERE source_id=b.source_id AND revoked_at IS NULL ORDER BY enabled DESC,created_at LIMIT 1;
 IF k.key_id IS NOT NULL AND a.enrollment_id<>k.enrollment_id THEN
  UPDATE platform_private.support_automation SET enrollment_id=k.enrollment_id WHERE client_id=p_client;
  a.enrollment_id:=k.enrollment_id;
 END IF;
 IF k.enabled THEN a.state:='enabled';a.reason:='existing_verified_credential';
 ELSIF NOT coalesce(ready,false) THEN a.state:='waiting';a.reason:='owner_onboarding_or_base_job';
 ELSIF p_action='record' THEN
  IF a.release_sha256 IS NOT NULL AND p_data ? 'release_sha256' AND a.release_sha256<>p_data->>'release_sha256' THEN RAISE EXCEPTION 'Pinned Support release changed' USING errcode='PT409';END IF;
  IF p_data-ARRAY['state','reason','release_sha256']<>'{}' OR p_data->>'state' NOT IN ('preparing','installing','verifying','enabled','attention','waiting')
   OR p_data->>'reason' NOT IN ('release_not_promoted','history_attention','provider_attention','proof_pending','enrollment','installed','verified','prerequisites') THEN RAISE EXCEPTION 'Invalid automation status';END IF;
  a.state:=p_data->>'state';a.reason:=p_data->>'reason';
 ELSIF p_action<>'context' THEN RAISE EXCEPTION 'Invalid automation command';END IF;
 -- Status is evidence, never a substitute for the credential's enabled bit.
 IF a.state='enabled' AND NOT coalesce(k.enabled,false) THEN a.state:='attention';a.reason:='proof_pending';END IF;
 UPDATE platform_private.support_automation SET state=a.state,reason=a.reason,release_sha256=coalesce(p_data->>'release_sha256',release_sha256),updated_at=now() WHERE client_id=p_client;
 INSERT INTO public.operator_audit(client_id,actor_id,action,detail) VALUES(p_client,p_actor,'support_automation_observed',jsonb_build_object('state',a.state,'reason',a.reason,'request_id',a.enrollment_id));
 RETURN jsonb_build_object('state',a.state,'reason',a.reason,'ready',coalesce(ready,false),'request_id',a.enrollment_id,
  'project_ref',s.project_ref,'source_id',b.source_id,'client_binding',s.client_binding,'provision_request',a.provision_request,'release_sha256',a.release_sha256,
  'write_unresolved',EXISTS(SELECT 1 FROM platform_private.support_install_fences f WHERE f.client_id=p_client AND f.acknowledged_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.platform_support_automation_command(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_automation_command(uuid,uuid,integer,text,jsonb) TO service_role;

CREATE FUNCTION public.platform_support_automation_status(p_client integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a platform_private.support_automation;k platform_private.support_ticket_credentials;c public.clients;
BEGIN
 PERFORM platform_private.require_role(ARRAY['master_admin','portfolio_manager']);
 SELECT * INTO c FROM public.clients WHERE id=p_client;
 IF c.lifecycle_state='Archived' OR c.infrastructure_state IN ('destroyed','decommissioned') THEN RETURN jsonb_build_object('state','revoked','reason','retired_target');END IF;
 SELECT k1.* INTO k FROM platform_private.support_ticket_credentials k1
 JOIN public.bridge_sources b ON b.source_id=k1.source_id
 JOIN platform_private.shop_credentials s ON s.client_id=b.client_id AND s.project_ref=k1.project_ref AND s.client_binding=k1.client_binding
 WHERE b.client_id=p_client AND b.client_binding=k1.client_binding ORDER BY k1.enabled DESC,k1.created_at DESC LIMIT 1;
 IF k.enabled AND k.revoked_at IS NULL THEN RETURN jsonb_build_object('state','enabled','reason','verified','request_id',k.enrollment_id,'write_unresolved',EXISTS(SELECT 1 FROM platform_private.support_install_fences f WHERE f.client_id=p_client AND f.acknowledged_at IS NULL));END IF;
 IF c.pairing_mode='byo' AND k.key_id IS NOT NULL THEN RETURN jsonb_build_object('state',CASE WHEN k.revoked_at IS NULL THEN 'verifying' ELSE 'revoked' END,'reason','proof_pending','request_id',k.enrollment_id);END IF;
 SELECT * INTO a FROM platform_private.support_automation WHERE client_id=p_client;
 RETURN CASE WHEN a.client_id IS NULL THEN jsonb_build_object('state','waiting','reason','prerequisites')
 ELSE jsonb_build_object('state',a.state,'reason',a.reason,'updated_at',a.updated_at,'request_id',a.enrollment_id,'release_sha256',a.release_sha256,'write_unresolved',EXISTS(SELECT 1 FROM platform_private.support_install_fences f WHERE f.client_id=p_client AND f.acknowledged_at IS NULL)) END;
END $$;
REVOKE ALL ON FUNCTION public.platform_support_automation_status(integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.platform_support_automation_status(integer) TO authenticated;
COMMIT;
