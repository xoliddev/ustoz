/**
 * The time-independent part of the demo: centre, branches, rooms, teachers, courses, students, parents and the
 * five persona logins. Baked into the snapshot once; `activity.ts` adds everything that depends on "today".
 */
import { rng, stableUuid } from '@ustoz/core';
import { insertMany, json, type Sql } from '@ustoz/db';
import { BRANCHES, CENTRE, COURSES, FIRST_F, FIRST_M, GROUPS, LAST, PERSONAS, ROOMS, TEACHERS } from './data';

export const id = (k: string) => stableUuid(`ustoz-demo:${k}`);
export const CENTRE_ID = id('centre');

export interface DemoStudent {
  id: string;
  key: string;
  name: string;
  phone: string;
  group: string;
  parentId: string | null;
  /** index inside its group (0 = first enrolled) */
  slot: number;
}

const female = (last: string) => (last.endsWith('ov') || last.endsWith('ev') || last.endsWith('yev') ? `${last}a` : last);

/** Deterministic roster: who is in which group, and which of them share a parent. */
export function roster(): { students: DemoStudent[]; parents: Array<{ id: string; name: string; phone: string; tg: number | null }> } {
  const r = rng(20261118);
  const students: DemoStudent[] = [];
  const parents: Array<{ id: string; name: string; phone: string; tg: number | null }> = [];
  let n = 0;
  for (const g of GROUPS) {
    for (let k = 0; k < g.size; k++, n++) {
      const isF = r() < 0.5;
      const last = LAST[Math.floor(r() * LAST.length)]!;
      const first = (isF ? FIRST_F : FIRST_M)[Math.floor(r() * 20)]!;
      let name = `${first} ${isF ? female(last) : last}`;
      // persona student and sibling
      if (g.key === 'a2-1' && k === 0) name = 'Aziz Karimov';
      if (g.key === 'kids-1' && k === 0) name = 'Madina Karimova';
      const kids = g.course === 'kids' || g.course === 'math' || g.course === 'gen-a2';
      const sid = id(`student:${n}`);
      let parentId: string | null = null;
      if (g.key === 'a2-1' && k === 0) parentId = id('parent:karimova');
      else if (g.key === 'kids-1' && k === 0) parentId = id('parent:karimova');
      else if (kids || r() < 0.3) {
        parentId = id(`parent:${n}`);
        const pf = r() < 0.7;
        const pLast = name.split(' ')[1]!.replace(/a$/, '');
        parents.push({ id: parentId, name: `${(pf ? FIRST_F : FIRST_M)[Math.floor(r() * 20)]} ${pf ? female(pLast) : pLast}`, phone: `+99893${String(2_000_000 + n).padStart(7, '0')}`, tg: null });
      }
      students.push({ id: sid, key: `s${n}`, name, phone: `+99890${String(5_000_000 + n).padStart(7, '0')}`, group: g.key, parentId, slot: k });
    }
  }
  parents.push({ id: id('parent:karimova'), name: 'Shoira Karimova', phone: '+998935550105', tg: PERSONAS.parent.id });
  // a few more siblings: the second child of every 9th family shares the first child's parent
  for (let i = 9; i + 1 < students.length; i += 17) {
    const a = students[i]!;
    const b = students[i + 1]!;
    if (a.parentId && b.parentId && a.group !== b.group) {
      const drop = b.parentId;
      b.parentId = a.parentId;
      const idx = parents.findIndex((p) => p.id === drop);
      if (idx >= 0) parents.splice(idx, 1);
    }
  }
  return { students, parents };
}

export async function seedStatic(tx: Sql): Promise<void> {
  await tx.query('insert into centres (id, slug, name, settings) values ($1,$2,$3,$4::jsonb)', [CENTRE_ID, CENTRE.slug, CENTRE.name, json({ siblingBp: 1000, dueDay: 10 })]);
  await insertMany(tx, 'branches', ['centre_id', 'id', 'name', 'address'], BRANCHES.map((b) => [CENTRE_ID, id(`branch:${b.key}`), b.name, b.address]));
  await insertMany(tx, 'rooms', ['centre_id', 'id', 'branch_id', 'name', 'capacity'], ROOMS.map((r) => [CENTRE_ID, id(`room:${r.key}`), id(`branch:${r.branch}`), r.name, r.capacity]));
  await insertMany(tx, 'teachers', ['centre_id', 'id', 'full_name', 'phone', 'telegram_id', 'subjects', 'salary_scheme', 'salary_amount', 'salary_bp', 'color'],
    TEACHERS.map((t) => [CENTRE_ID, id(`teacher:${t.key}`), t.name, t.phone, t.key === 'dilnoza' ? PERSONAS.teacher.id : null, [...t.subjects], t.scheme, t.amount, t.bp, t.color]));
  await insertMany(tx, 'courses', ['centre_id', 'id', 'name', 'subject', 'level', 'monthly_fee', 'duration_months', 'color'],
    COURSES.map((c) => [CENTRE_ID, id(`course:${c.key}`), c.name, c.subject, c.level, c.fee, c.months, c.color]));
  const { students, parents } = roster();
  await insertMany(tx, 'students', ['centre_id', 'id', 'full_name', 'phone', 'telegram_id'],
    students.map((s) => [CENTRE_ID, s.id, s.name, s.name === 'Aziz Karimov' ? '+998905550104' : s.phone, s.name === 'Aziz Karimov' ? PERSONAS.student.id : null]));
  await insertMany(tx, 'parents', ['centre_id', 'id', 'full_name', 'phone', 'telegram_id'], parents.map((p) => [CENTRE_ID, p.id, p.name, p.phone, p.tg]));
  await insertMany(tx, 'student_parents', ['centre_id', 'student_id', 'parent_id'], students.filter((s) => s.parentId).map((s) => [CENTRE_ID, s.id, s.parentId]));
  const people = { director: null, admin: null, teacher: id('teacher:dilnoza'), student: students.find((s) => s.name === 'Aziz Karimov')!.id, parent: id('parent:karimova') };
  for (const [role, u] of Object.entries(PERSONAS) as Array<[keyof typeof PERSONAS, (typeof PERSONAS)[keyof typeof PERSONAS]]>) {
    const uid = id(`user:${role}`);
    await tx.query('insert into users (id, telegram_id, first_name, last_name, language_code) values ($1,$2,$3,$4,$5)', [uid, u.id, u.first_name, u.last_name ?? null, 'uz']);
    await tx.query('insert into members (centre_id, user_id, role, person_id) values ($1,$2,$3,$4)', [CENTRE_ID, uid, role, people[role]]);
  }
}

export const personaStudentName = 'Aziz Karimov';
export const personaSiblingName = 'Madina Karimova';
