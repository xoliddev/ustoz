// GENERATED from migrations/0001_schema.sql by `npm run gen:migrations -w @ustoz/db` — do not edit by hand.
export default String.raw`-- Ustoz schema v1. Runs unchanged on PostgreSQL 16+ and PGlite.
-- Money: bigint tiyin. IDs: UUIDs generated in core. Every tenant table starts with centre_id (RLS in 0002).

create table users (
  id uuid primary key,
  telegram_id bigint not null unique,
  first_name text not null,
  last_name text,
  username text,
  language_code text not null default 'uz',
  created_at timestamptz not null default now()
);

create table processed_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

create table centres (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  timezone text not null default 'Asia/Tashkent',
  settings jsonb not null default '{}',
  receipt_seq int not null default 0,
  created_at timestamptz not null default now()
);

create table branches (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  name text not null,
  address text not null default ''
);

create table rooms (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  branch_id uuid not null references branches(id),
  name text not null,
  capacity int not null default 12 check (capacity between 1 and 500)
);

create table teachers (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  full_name text not null,
  phone text,
  telegram_id bigint,
  subjects text[] not null default '{}',
  salary_scheme text not null default 'fixed' check (salary_scheme in ('fixed','per_student','percent')),
  salary_amount bigint not null default 0 check (salary_amount >= 0),
  salary_bp int not null default 0 check (salary_bp between 0 and 10000),
  color text not null default '#4f46e5',
  active boolean not null default true
);

create table courses (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  name text not null,
  subject text not null,
  level text not null default '',
  monthly_fee bigint not null check (monthly_fee >= 0),
  duration_months int not null default 3 check (duration_months between 1 and 48),
  color text not null default '#4f46e5'
);

create table groups (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  course_id uuid not null references courses(id),
  teacher_id uuid references teachers(id),
  room_id uuid references rooms(id),
  branch_id uuid not null references branches(id),
  name text not null,
  days int[] not null check (array_length(days, 1) between 1 and 7),
  start_min int not null check (start_min between 0 and 1439),
  end_min int not null check (end_min between 1 and 1440 and end_min > start_min),
  starts_on date not null,
  ends_on date,
  monthly_fee bigint not null check (monthly_fee >= 0),
  capacity int not null default 12,
  status text not null default 'active' check (status in ('active','finished')),
  created_at timestamptz not null default now()
);
create index on groups (centre_id, teacher_id);

create table students (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  full_name text not null,
  phone text,
  birth_year int,
  telegram_id bigint,
  locale text not null default 'uz',
  status text not null default 'active' check (status in ('active','left')),
  created_at timestamptz not null default now()
);

create table parents (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  full_name text not null,
  phone text,
  telegram_id bigint,
  locale text not null default 'uz'
);

create table student_parents (
  centre_id uuid not null references centres(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  primary key (student_id, parent_id)
);

create table enrollments (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  group_id uuid not null references groups(id),
  student_id uuid not null references students(id),
  joined_on date not null,
  left_on date,
  custom_bp int not null default 0 check (custom_bp between 0 and 10000),
  created_at timestamptz not null default now()
);
create index on enrollments (centre_id, group_id);
create index on enrollments (centre_id, student_id);

create table attendance (
  centre_id uuid not null references centres(id) on delete cascade,
  group_id uuid not null references groups(id),
  student_id uuid not null references students(id),
  date date not null,
  status text not null check (status in ('present','late','absent','excused')),
  marked_by uuid,
  marked_at timestamptz not null default now(),
  primary key (group_id, student_id, date)
);
create index on attendance (centre_id, date);
create index on attendance (centre_id, student_id, date);

create table prepaid_plans (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  enrollment_id uuid not null references enrollments(id),
  from_month text not null,
  months int not null check (months between 1 and 24),
  bp int not null check (bp between 0 and 10000),
  created_at timestamptz not null default now()
);

create table invoices (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  enrollment_id uuid not null references enrollments(id),
  student_id uuid not null references students(id),
  group_id uuid not null references groups(id),
  month text not null,
  base bigint not null,
  prorated bigint not null,
  discounts jsonb not null default '[]',
  total bigint not null check (total >= 0),
  lessons_billed int not null,
  lessons_in_month int not null,
  created_at timestamptz not null default now(),
  unique (enrollment_id, month)
);
create index on invoices (centre_id, month);
create index on invoices (centre_id, student_id);

create table payments (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  student_id uuid not null references students(id),
  amount bigint not null check (amount > 0),
  method text not null check (method in ('cash','card','transfer','payme','click','uzum')),
  status text not null default 'paid' check (status in ('pending','paid','cancelled')),
  receipt_no text,
  note text not null default '',
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on payments (centre_id, student_id);
create index on payments (centre_id, paid_at);

create table payment_txns (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  payment_id uuid not null references payments(id),
  provider text not null check (provider in ('payme','click','uzum')),
  provider_txn_id text not null,
  state int not null,
  amount bigint not null,
  created_at timestamptz not null default now(),
  performed_at timestamptz,
  cancelled_at timestamptz,
  reason int,
  unique (provider, provider_txn_id)
);

create table leads (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  full_name text not null,
  phone text not null,
  course_id uuid references courses(id),
  source text not null default 'instagram',
  stage text not null default 'new' check (stage in ('new','placement','trial','enrolled','lost')),
  reached text not null default 'new',
  placement_score int check (placement_score between 0 and 100),
  level text,
  trial_group_id uuid references groups(id),
  trial_date date,
  student_id uuid references students(id),
  lost_reason text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lead_events (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  at timestamptz not null default now(),
  by_user uuid
);
`;
