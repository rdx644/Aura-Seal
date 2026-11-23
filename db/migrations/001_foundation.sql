create schema if not exists auraseal;
revoke all on schema auraseal from public;
set search_path = auraseal, pg_catalog;

create table organizations (
  id uuid primary key,
  name text not null
);

create table organizer_users (
  id uuid primary key,
  org_id uuid not null references organizations,
  login text unique not null,
  password_hash text not null,
  role text not null check (role in ('issuer', 'reviewer'))
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references organizer_users on delete cascade,
  expires_at timestamptz not null
);

create table events (
  id uuid primary key,
  org_id uuid not null references organizations,
  fields jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create table imports (
  id uuid primary key,
  org_id uuid not null,
  event_id uuid not null,
  rows jsonb not null,
  errors jsonb not null,
  proposal jsonb,
  created_at timestamptz not null default now(),
  foreign key (org_id, event_id) references events (org_id, id),
  unique (org_id, id)
);

create table audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations,
  organizer_id uuid references organizer_users,
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table rate_limits (
  bucket text primary key,
  window_end timestamptz not null,
  hits integer not null
);

create function authorized_tenant(row_org uuid) returns boolean
language sql stable
as $$ select coalesce(current_setting('auraseal.scope', true) in ('system', row_org::text), false) $$;

alter table events enable row level security;
alter table events force row level security;
create policy event_tenant on events using (authorized_tenant(org_id)) with check (authorized_tenant(org_id));
alter table imports enable row level security;
alter table imports force row level security;
create policy import_tenant on imports using (authorized_tenant(org_id)) with check (authorized_tenant(org_id));
alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_tenant on audit_events
  using (authorized_tenant(org_id)) with check (authorized_tenant(org_id));

create function forbid_audit_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit events are append-only';
end;
$$;
create trigger audit_append_only before update or delete on audit_events
for each row execute function forbid_audit_change();
