create table if not exists businesses (
  id text primary key,
  name text not null,
  slug text not null unique,
  type text not null check (type in ('salon', 'gym')),
  admin_passcode_hash text not null,
  support_email text not null,
  current_plan text not null default 'starter' check (current_plan in ('starter', 'pro')),
  settings_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  status text not null default 'new' check (status in ('new', 'converted')),
  source text not null default 'public' check (source in ('public', 'seed')),
  converted_booking_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_business_created_idx on leads (business_id, created_at desc);
create index if not exists leads_business_contact_idx on leads (business_id, lower(email), phone);

create table if not exists bookings (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  service text not null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null check (source in ('public', 'lead', 'seed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bookings add column if not exists business_id text;
alter table bookings add column if not exists completed_at timestamptz;
alter table bookings drop constraint if exists bookings_service_check;
alter table bookings drop constraint if exists bookings_source_check;
update bookings
set source = case
  when source in ('live', 'demo') then 'public'
  else source
end
where source is not null;

create index if not exists bookings_business_scheduled_idx on bookings (business_id, scheduled_at desc);
create index if not exists bookings_business_status_idx on bookings (business_id, status);

create table if not exists jobs (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  booking_id text not null references bookings(id) on delete cascade,
  type text not null check (type in ('reminder', 'follow_up', 'reengagement')),
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jobs add column if not exists business_id text;
alter table jobs drop constraint if exists jobs_type_check;
delete from jobs where type = 'demo_complete';
update jobs
set business_id = bookings.business_id
from bookings
where jobs.booking_id = bookings.id
  and jobs.business_id is null;

create index if not exists jobs_status_run_at_idx on jobs (status, run_at);
create index if not exists jobs_business_status_run_at_idx on jobs (business_id, status, run_at);
create unique index if not exists jobs_unique_pending_type_idx on jobs (booking_id, type) where status in ('pending', 'running');

create table if not exists message_log (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
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

alter table message_log add column if not exists business_id text;
update message_log
set business_id = bookings.business_id
from bookings
where message_log.booking_id = bookings.id
  and message_log.business_id is null;

create index if not exists message_log_business_created_idx on message_log (business_id, created_at desc);
