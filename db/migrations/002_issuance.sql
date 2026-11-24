set search_path = auraseal, pg_catalog;

create table issuance_batches (
  id uuid primary key,
  org_id uuid not null,
  import_id uuid not null,
  approved_by uuid not null references organizer_users,
  created_at timestamptz not null default now(),
  foreign key (org_id, import_id) references imports (org_id,id),
  unique (org_id, id),
  unique (org_id, import_id)
);

alter table imports add column batch_id uuid;
alter table imports add column proposal_started timestamptz;
alter table imports add foreign key (org_id, batch_id) references issuance_batches (org_id,id);

create table certificates (
  id uuid primary key,
  org_id uuid not null,
  event_id uuid not null,
  batch_id uuid not null,
  participant_key text not null,
  verification_id text unique not null check (verification_id ~ '^[a-f0-9]{32}$'),
  claims jsonb not null,
  content_digest text not null,
  status text not null default 'issued' check (status in ('issued', 'revoked', 'superseded')),
  issued_at timestamptz not null default now(),
  superseded_by uuid,
  foreign key (org_id, event_id) references events (org_id,id),
  foreign key (org_id, batch_id) references issuance_batches (org_id,id),
  unique (org_id, id)
);
alter table certificates add foreign key (org_id, superseded_by) references certificates (org_id,id);
create unique index certificates_current_participant on certificates (org_id,event_id,participant_key)
  where status <> 'superseded';

create table batch_items (
  batch_id uuid not null,
  org_id uuid not null,
  ordinal integer not null,
  certificate_id uuid not null,
  created boolean not null,
  primary key (batch_id,ordinal),
  foreign key (org_id,batch_id) references issuance_batches (org_id,id),
  foreign key (org_id,certificate_id) references certificates (org_id,id)
);

create table render_jobs (
  certificate_id uuid primary key,
  org_id uuid not null,
  status text not null default 'queued' check (status in ('queued','working','ready','failed','partial')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  error_code text,
  foreign key (org_id,certificate_id) references certificates (org_id,id)
);
create index render_available on render_jobs (available_at) where status in ('queued','working');

create table render_assets (
  certificate_id uuid primary key,
  org_id uuid not null,
  png bytea not null,
  pdf bytea not null,
  mp4 bytea check (octet_length(mp4) < 3000000),
  foreign key (org_id,certificate_id) references certificates (org_id,id)
);

do $$
declare relation text;
begin
  foreach relation in array array['issuance_batches','certificates','batch_items','render_jobs','render_assets']
  loop
    execute format('alter table %I enable row level security', relation);
    execute format('alter table %I force row level security', relation);
    execute format('create policy scoped_access on %I using (authorized_tenant(org_id)) with check (authorized_tenant(org_id))', relation);
  end loop;
end;
$$;
