-- Multi-tenant isolation. The application connects as the schema owner but runs every request inside a
-- transaction as the non-owner role ustoz_app, with app.centre_id / app.user_id set (see client.ts inScope).
-- RLS is enabled on every tenant table, so a query can only ever see and write its own centre's rows.
-- A few cross-tenant lookups (login by Telegram id, payment webhooks, public certificate check) go through
-- SECURITY DEFINER functions that take exact keys and return only what that flow needs.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ustoz_app') then
    create role ustoz_app nologin;
  end if;
end $$;
do $$ begin
  execute format('grant ustoz_app to %I', current_user);
exception when others then null;
end $$;

create or replace function app_centre() returns uuid language sql stable as
  $$ select nullif(current_setting('app.centre_id', true), '')::uuid $$;
create or replace function app_user() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','rooms','teachers','courses','groups','students','parents','student_parents','enrollments','attendance',
    'prepaid_plans','invoices','payments','payment_txns','leads','lead_events','homework','submissions','tests',
    'test_attempts','certificates','outbox','bot_state','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I to ustoz_app using (centre_id = app_centre()) with check (centre_id = app_centre())', t);
  end loop;
end $$;

alter table centres enable row level security;
create policy centres_member on centres for select to ustoz_app
  using (id = app_centre() or id in (select centre_id from members where user_id = app_user()));
create policy centres_update on centres for update to ustoz_app using (id = app_centre()) with check (id = app_centre());

alter table members enable row level security;
create policy members_isolation on members to ustoz_app
  using (centre_id = app_centre() or user_id = app_user())
  with check (centre_id = app_centre());

alter table users enable row level security;
create policy users_self on users to ustoz_app using (id = app_user()) with check (id = app_user());

grant usage on schema public to ustoz_app;
grant select, insert, update, delete on all tables in schema public to ustoz_app;
revoke update, delete on audit_log from ustoz_app;
grant execute on function app_centre() to ustoz_app;
grant execute on function app_user() to ustoz_app;

-- Login: create/refresh the user row by Telegram id (the caller already verified initData).
create or replace function upsert_user(p_tg bigint, p_first text, p_last text, p_username text, p_lang text, p_id uuid)
returns uuid language sql security definer set search_path = public as $$
  insert into users (id, telegram_id, first_name, last_name, username, language_code)
  values (p_id, p_tg, left(p_first, 64), left(p_last, 64), left(p_username, 64), coalesce(nullif(p_lang, ''), 'uz'))
  on conflict (telegram_id) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    username = excluded.username, language_code = excluded.language_code
  returning id
$$;

-- Bot: the user shared their phone contact (Telegram guarantees it is theirs). Link every student, parent or
-- teacher record with that phone that is not linked to someone else yet, and create the member rows.
create or replace function claim_by_phone(p_phone text, p_user uuid, p_tg bigint)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    select centre_id, id, 'student' as role from students where phone = p_phone and (telegram_id is null or telegram_id = p_tg)
    union all select centre_id, id, 'parent' from parents where phone = p_phone and (telegram_id is null or telegram_id = p_tg)
    union all select centre_id, id, 'teacher' from teachers where phone = p_phone and (telegram_id is null or telegram_id = p_tg)
  loop
    if r.role = 'student' then update students set telegram_id = p_tg where id = r.id;
    elsif r.role = 'parent' then update parents set telegram_id = p_tg where id = r.id;
    else update teachers set telegram_id = p_tg where id = r.id; end if;
    insert into members (centre_id, user_id, role, person_id) values (r.centre_id, p_user, r.role, r.id)
      on conflict (centre_id, user_id, role) do update set person_id = excluded.person_id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function verify_certificate(p_code text)
returns table (code text, student_name text, course_name text, level text, issued_on date, centre_name text, signature text, revoked boolean)
language sql stable security definer set search_path = public as $$
  select c.code, c.student_name, c.course_name, c.level, c.issued_on, c.centre_name, c.signature, c.revoked
  from certificates c where c.code = upper(p_code) limit 1
$$;

create or replace function payment_centre(p_payment uuid) returns uuid language sql stable security definer set search_path = public as
  $$ select centre_id from payments where id = p_payment $$;

create or replace function txn_centre(p_provider text, p_txn text) returns uuid language sql stable security definer set search_path = public as
  $$ select centre_id from payment_txns where provider = p_provider and provider_txn_id = p_txn $$;

create or replace function job_centres() returns setof uuid language sql stable security definer set search_path = public as
  $$ select id from centres order by created_at $$;

-- Outbox deliverer (bot process): claims due messages across centres, at most 5 attempts each.
create or replace function claim_outbox(p_limit int)
returns table (id uuid, centre_id uuid, recipient_tg bigint, template text, params jsonb, locale text)
language sql security definer set search_path = public as $$
  update outbox o set attempts = o.attempts + 1
  where o.id in (select x.id from outbox x where x.sent_at is null and x.attempts < 5 and x.recipient_tg is not null
                 order by x.created_at limit p_limit for update skip locked)
  returning o.id, o.centre_id, o.recipient_tg, o.template, o.params, o.locale
$$;

create or replace function mark_outbox(p_id uuid, p_ok boolean, p_error text) returns void
language sql security definer set search_path = public as
  $$ update outbox set sent_at = case when p_ok then now() else null end, error = case when p_ok then null else left(p_error, 500) end where id = p_id $$;

revoke all on function upsert_user(bigint, text, text, text, text, uuid) from public;
revoke all on function claim_by_phone(text, uuid, bigint) from public;
revoke all on function claim_outbox(int) from public;
revoke all on function mark_outbox(uuid, boolean, text) from public;
grant execute on function upsert_user(bigint, text, text, text, text, uuid) to ustoz_app;
grant execute on function claim_by_phone(text, uuid, bigint) to ustoz_app;
grant execute on function verify_certificate(text) to ustoz_app;
grant execute on function payment_centre(uuid) to ustoz_app;
grant execute on function txn_centre(text, text) to ustoz_app;
grant execute on function job_centres() to ustoz_app;
grant execute on function claim_outbox(int) to ustoz_app;
grant execute on function mark_outbox(uuid, boolean, text) to ustoz_app;
