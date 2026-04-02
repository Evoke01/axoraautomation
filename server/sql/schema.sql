create table if not exists bookings (
  id text primary key,
  name text not null,
  email text not null,
  phone text not null,
  service text not null check (service in ('haircut', 'facial')),
  scheduled_at timestamptz not null,
  status text not null check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null check (source in ('live', 'demo', 'seed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  booking_id text not null references bookings(id) on delete cascade,
  type text not null check (type in ('reminder', 'follow_up', 'reengagement', 'demo_complete')),
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_run_at_idx on jobs (status, run_at);
create unique index if not exists jobs_unique_pending_type_idx on jobs (booking_id, type) where status in ('pending', 'running');

create table if not exists message_log (
  id text primary key,
  booking_id text not null references bookings(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reminder', 'follow_up', 'reengagement')),
  delivery_mode text not null check (delivery_mode in ('demo', 'live')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  subject text not null,
  to_email text not null,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (booking_id, kind)
);
