// GENERATED from migrations/0002_learning.sql by `npm run gen:migrations -w @ustoz/db` — do not edit by hand.
export default String.raw`-- Members, learning (homework, tests, certificates), notifications and audit.

create table members (
  centre_id uuid not null references centres(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('director','admin','teacher','student','parent')),
  person_id uuid,
  created_at timestamptz not null default now(),
  primary key (centre_id, user_id, role)
);
create index on members (user_id);

create table homework (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  group_id uuid not null references groups(id),
  title text not null,
  description text not null default '',
  due_on date not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on homework (centre_id, group_id);

create table submissions (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  homework_id uuid not null references homework(id) on delete cascade,
  student_id uuid not null references students(id),
  kind text not null check (kind in ('text','photo','file')),
  body text not null default '',
  file_name text,
  file_data text,
  submitted_at timestamptz not null default now(),
  grade int check (grade between 0 and 100),
  feedback text,
  graded_at timestamptz,
  graded_by uuid,
  unique (homework_id, student_id)
);

create table tests (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  group_id uuid not null references groups(id),
  title text not null,
  topic text not null default '',
  source text not null default 'local',
  questions jsonb not null,
  status text not null default 'published' check (status in ('draft','published','closed')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table test_attempts (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  test_id uuid not null references tests(id) on delete cascade,
  student_id uuid not null references students(id),
  answers jsonb not null,
  correct int not null,
  total int not null,
  score int not null check (score between 0 and 100),
  duration_sec int not null default 0,
  submitted_at timestamptz not null default now(),
  unique (test_id, student_id)
);

create table certificates (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  code text not null unique,
  student_id uuid not null references students(id),
  course_id uuid references courses(id),
  student_name text not null,
  course_name text not null,
  level text not null,
  issued_on date not null,
  centre_name text not null,
  signature text not null,
  revoked boolean not null default false
);

create table outbox (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  recipient_tg bigint,
  recipient_kind text not null check (recipient_kind in ('student','parent','teacher','staff')),
  recipient_id uuid not null,
  template text not null,
  params jsonb not null default '{}',
  locale text not null default 'uz',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  error text
);
create index on outbox (centre_id, recipient_id, created_at);
create index on outbox (sent_at) where sent_at is null;

create table bot_state (
  centre_id uuid not null references centres(id) on delete cascade,
  telegram_id bigint not null,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (centre_id, telegram_id)
);

create table audit_log (
  centre_id uuid not null references centres(id) on delete cascade,
  id uuid primary key,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on audit_log (centre_id, at);
`;
