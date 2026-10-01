-- Onboarding V2:
-- Allow authenticated Platform operators to create/edit clients.
-- Row Level Security remains the authorization boundary:
--   master_admin and portfolio_manager only.

grant insert, update
on table public.clients
to authenticated;

-- If clients.id is backed by a sequence, allow inserts to obtain the next id.
do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('public.clients', 'id');

  if seq_name is not null then
    execute format(
      'grant usage, select on sequence %s to authenticated',
      seq_name
    );
  end if;
end
$$;