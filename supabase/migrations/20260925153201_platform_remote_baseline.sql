SET local check_function_bodies = off;

CREATE SEQUENCE "public"."clients_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."support_tickets_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."billing_cycles" (
  "id"                      bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "created_at"              timestamp with time zone DEFAULT now(),
  "client_id"               integer                  NOT NULL,
  "period_start"            date                     NOT NULL,
  "period_end"              date                     NOT NULL,
  "fixed_fee"               numeric                  DEFAULT 0,
  "receipt_count"           integer                  DEFAULT 0,
  "per_receipt_rate"        numeric                  DEFAULT 0,
  "total_due"               numeric                  DEFAULT 0,
  "status"                  text                     DEFAULT 'Unpaid'::text,
  "paid_at"                 timestamp with time zone,
  "notes"                   text,
  "ticket_count"            integer                  DEFAULT 0,
  "per_ticket_rate"         numeric                  DEFAULT 0,
  "item_count"              integer                  DEFAULT 0,
  "per_item_rate"           numeric                  DEFAULT 0,
  "invoice_date"            timestamp with time zone,
  "due_date"                date,
  "carried_forward_balance" numeric                  DEFAULT 0,
  "current_charges"         numeric                  DEFAULT 0,
  "remaining_balance"       numeric                  DEFAULT 0,
  "payment_status"          text                     DEFAULT 'Unpaid'::text,
  "bill_count"              integer                  DEFAULT 0,
  "event_rate"              numeric                  DEFAULT 0,
  "inventory_count"         integer                  DEFAULT 0,
  "inventory_rate"          numeric                  DEFAULT 0,
  "bill_charges"            numeric                  DEFAULT 0,
  "inventory_charges"       numeric                  DEFAULT 0,
  CONSTRAINT "billing_cycles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."billing_cycles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."client_credit" (
  "id"                 bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "client_id"          integer                  NOT NULL,
  "source_invoice_id"  bigint                   NOT NULL,
  "amount_outstanding" numeric                  NOT NULL DEFAULT 0,
  "is_cleared"         boolean                  DEFAULT false,
  "cleared_at"         timestamp with time zone,
  "created_at"         timestamp with time zone DEFAULT now(),
  CONSTRAINT "client_credit_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."client_credit"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clients" (
  "id"                    integer                  NOT NULL DEFAULT nextval('public.clients_id_seq'::regclass),
  "name"                  text                     NOT NULL,
  "industry"              text                     DEFAULT 'Retail'::text,
  "plan"                  text                     DEFAULT 'Basic'::text,
  "status"                text                     DEFAULT 'Active'::text,
  "supabase_url"          text                     NOT NULL,
  "supabase_anon"         text                     NOT NULL,
  "shop_url"              text                     DEFAULT ''::text,
  "created_at"            timestamp with time zone DEFAULT now(),
  "billing_model"         text                     DEFAULT 'fixed'::text,
  "per_receipt_rate"      numeric                  DEFAULT 0,
  "fixed_fee"             numeric                  DEFAULT 2500,
  "currency_symbol"       text                     DEFAULT 'Rs.'::text,
  "per_ticket_rate"       numeric                  DEFAULT 10,
  "per_item_rate"         numeric                  DEFAULT 1,
  "grace_period_ends_at"  timestamp with time zone,
  "event_rate"            numeric                  DEFAULT 0,
  "inventory_rate"        numeric                  DEFAULT 0,
  "bill_billable"         boolean                  DEFAULT true,
  "inventory_billable"    boolean                  DEFAULT false,
  "ems_enabled"           boolean                  DEFAULT false,
  "live_tracking_enabled" boolean                  DEFAULT false,
  "workshop_enabled"      boolean                  DEFAULT false,
  CONSTRAINT "clients_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."clients"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"             bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "invoice_id"     bigint                   NOT NULL,
  "client_id"      integer                  NOT NULL,
  "amount"         numeric                  NOT NULL,
  "payment_method" text                     NOT NULL,
  "payment_date"   date                     NOT NULL,
  "notes"          text,
  "recorded_by"    text                     DEFAULT 'admin'::text,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."platform_config" (
  "id"             integer NOT NULL DEFAULT 1,
  "admin_password" text    DEFAULT '1234'::text,
  "admin_username" text    DEFAULT 'admin'::text,
  CONSTRAINT "platform_config_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."platform_config"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."platform_users" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "auth_user_id" uuid,
  "name"         text                     NOT NULL,
  "email"        text                     NOT NULL,
  "role"         text                     NOT NULL,
  "status"       text                     DEFAULT 'Active'::text,
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "platform_users_email_key" UNIQUE (email),
  CONSTRAINT "platform_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_users_role_check" CHECK ((role = ANY (ARRAY['billing_person'::text, 'portfolio_manager'::text])))
);

ALTER TABLE "public"."platform_users"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pricing_rate_log" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "module_type" text                     NOT NULL,
  "old_rate"    numeric                  NOT NULL,
  "new_rate"    numeric                  NOT NULL,
  "changed_at"  timestamp with time zone DEFAULT now(),
  "notes"       text,
  "client_id"   integer,
  CONSTRAINT "pricing_rate_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pricing_rate_log"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."support_tickets" (
  "id"          integer                  NOT NULL DEFAULT nextval('public.support_tickets_id_seq'::regclass),
  "client_id"   integer,
  "client_name" text,
  "subject"     text,
  "message"     text,
  "status"      text                     DEFAULT 'Open'::text,
  "created_at"  timestamp with time zone DEFAULT now(),
  "resolved_at" timestamp with time zone,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."support_tickets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."usage_logs" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_at"      timestamp with time zone DEFAULT now(),
  "client_id"        integer                  NOT NULL,
  "module_type"      text                     DEFAULT 'POS'::text,
  "token_count"      integer                  DEFAULT 1,
  "rate_at_log"      numeric                  DEFAULT 0,
  "is_invoiced"      boolean                  DEFAULT false,
  "billing_cycle_id" bigint,
  CONSTRAINT "usage_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."usage_logs"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."clients_id_seq" OWNED BY "public"."clients"."id";

ALTER SEQUENCE "public"."support_tickets_id_seq" OWNED BY "public"."support_tickets"."id";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."client_credit"
  ADD CONSTRAINT "client_credit_source_invoice_id_fkey" FOREIGN KEY (source_invoice_id) REFERENCES public.billing_cycles(id);

ALTER TABLE "public"."billing_cycles"
  ADD CONSTRAINT "billing_cycles_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE "public"."client_credit"
  ADD CONSTRAINT "client_credit_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.billing_cycles(id);

ALTER TABLE "public"."pricing_rate_log"
  ADD CONSTRAINT "pricing_rate_log_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE "public"."support_tickets"
  ADD CONSTRAINT "support_tickets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE "public"."usage_logs"
  ADD CONSTRAINT "usage_logs_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

CREATE POLICY "anon_access" ON "public"."billing_cycles"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_all" ON "public"."billing_cycles"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "platform_admin_only" ON "public"."billing_cycles"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "auth_all" ON "public"."client_credit"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all" ON "public"."clients"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "platform_admin_only" ON "public"."clients"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "auth_all" ON "public"."payments"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow all" ON "public"."platform_config"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "platform_admin_only" ON "public"."platform_config"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "master_admin_write" ON "public"."platform_users"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "read_own_row" ON "public"."platform_users"
  FOR SELECT
  TO "authenticated"
  USING (((auth.email() = email) OR (auth.email() = 'platformadmin@retailos.internal'::text)));

CREATE POLICY "platform_admin_only" ON "public"."pricing_rate_log"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "allow all" ON "public"."support_tickets"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_insert_tickets" ON "public"."support_tickets"
  FOR INSERT
  TO "anon"
  WITH CHECK (true);

CREATE POLICY "platform_admin_all" ON "public"."support_tickets"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE POLICY "anon_access" ON "public"."usage_logs"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_insert_only" ON "public"."usage_logs"
  FOR INSERT
  TO "anon"
  WITH CHECK (true);

CREATE POLICY "platform_admin_all" ON "public"."usage_logs"
  FOR ALL
  TO "authenticated"
  USING ((auth.email() = 'platformadmin@retailos.internal'::text))
  WITH CHECK ((auth.email() = 'platformadmin@retailos.internal'::text));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."billing_cycles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."clients";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."platform_config";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."pricing_rate_log";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."support_tickets";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."usage_logs";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."clients_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."support_tickets_id_seq" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_cycles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_credit" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."platform_config" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."platform_users" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricing_rate_log" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_tickets" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usage_logs" TO "anon", "authenticated", "postgres", "service_role";

