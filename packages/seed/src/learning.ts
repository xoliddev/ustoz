/** Demo homework, tests, certificates, leads and the notification history — all relative to "today". */
import {
  addDays, datesOn, fnv1a, gradeAttempt, humanCode, LocalTestGenerator, rng, signCertificate, type IsoDate, type LeadStage,
} from '@ustoz/core';
import { insertMany, json, type Sql } from '@ustoz/db';
import { COURSES, FIRST_F, FIRST_M, LAST, LEAD_SOURCES } from './data';
import { at, plan } from './activity';
import { CENTRE_ID, id } from './static';

const HOMEWORK: Record<string, string[]> = {
  English: ['Unit 5: Past Simple — 20 sentences', 'Vocabulary: Travel (30 words)', 'Essay: My weekend (120 words)', 'Listening: Track 12, questions 1–10', 'Reading: "The Lost City" + summary'],
  IELTS: ['Writing Task 2: Technology essay', 'Reading: Cambridge 18 Test 2', 'Speaking Part 2 recording', 'Writing Task 1: Line graph', 'Listening: Section 3 practice'],
  IT: ['Loops: 10 exercises', 'Functions and modules', 'Mini project: Todo CLI', 'Lists and dictionaries', 'Git: first repository'],
  Matematika: ['Kvadrat tenglamalar: 25 ta misol', 'Foizlar: DTM testlari', 'Geometriya: uchburchaklar', 'Logarifmlar: 15 ta misol', 'Progressiyalar'],
  'Rus tili': ['Падежи: упражнения 1–12', 'Текст: «Мой город»', 'Глаголы движения', 'Диалог в магазине', 'Лексика: еда'],
  Starter: ['Colours and numbers worksheet', 'My family drawing + 5 words', 'Animals song + 10 words', 'Alphabet A–M', 'Fruits flashcards'],
};
const TOPIC: Record<string, string> = { English: 'English grammar', IELTS: 'IELTS vocabulary', IT: 'Python', Matematika: 'Matematika', 'Rus tili': 'English grammar', Starter: 'English grammar' };
const ANSWERS = ['Bajardim, daftardagi rasmini yubordim.', 'Done! All 20 sentences are in the attached file.', 'Tayyor, essay 140 so\'z bo\'ldi.', 'Here is my homework, teacher.', 'Hammasini ishladim, 3-misolda savolim bor.'];

export async function seedLearning(tx: Sql, now: Date, today: IsoDate, certSecret: string): Promise<void> {
  const p = plan(now, today);
  const r = rng(fnv1a('learning'));
  const clamp = (iso: string) => (iso > now.toISOString() ? now.toISOString() : iso);
  const gen = new LocalTestGenerator();
  const hwRows: unknown[][] = [];
  const subRows: unknown[][] = [];
  const testRows: unknown[][] = [];
  const attemptRows: unknown[][] = [];
  for (const g of p.groups) {
    const course = COURSES.find((c) => c.key === g.course)!;
    const bank = HOMEWORK[course.level === 'Starter' ? 'Starter' : course.subject] ?? HOMEWORK.English!;
    const members = p.enrollments.filter((e) => e.groupKey === g.key && !e.leftOn);
    // homework given on the last 4 lessons before today and the next one
    const past = datesOn(g.days, g.startsOn, addDays(today, -1)).slice(-4);
    const next = datesOn(g.days, today, addDays(today, 7))[0];
    const list = [...past, ...(next ? [next] : [])];
    list.forEach((given, k) => {
      const hid = id(`hw:${g.key}:${k}`);
      const due = datesOn(g.days, addDays(given, 1), addDays(given, 8))[0] ?? addDays(given, 2);
      hwRows.push([CENTRE_ID, hid, g.id, bank[k % bank.length], 'Darslikdagi topshiriqlarni bajaring va botga yuboring.', due, id('user:teacher'), clamp(at(given, 12))]);
      for (const e of members) {
        if (e.joinedOn > given || given >= today) continue;
        const persona = e.student.name === 'Aziz Karimov';
        if (persona && k === past.length - 1) continue; // Aziz still has one to hand in through the bot
        if (!persona && r() > 0.82) continue;
        const sub = addDays(given, 1 + Math.floor(r() * 2));
        if (sub > today) continue;
        const graded = due < today && (k < past.length - 1 || r() < 0.3);
        const grade = 55 + Math.floor(r() * 46);
        subRows.push([CENTRE_ID, id(`sub:${hid}:${e.student.id}`), hid, e.student.id, 'text', ANSWERS[Math.floor(r() * ANSWERS.length)], sub < today ? at(sub, 19, 20) : now.toISOString(),
          graded ? grade : null, graded ? (grade >= 85 ? 'Ajoyib!' : grade >= 70 ? 'Yaxshi, xatolar ustida ishlang.' : 'Qayta ko\'rib chiqing.') : null, graded ? at(due, 21) : null]);
      }
    });
    // one test 9 days ago (taken by most) and, for A2-14, a fresh one the persona has not taken yet
    if (g.startsOn > addDays(today, -10)) continue;
    const tests = [{ k: 0, ago: 9 }, ...(g.key === 'a2-1' ? [{ k: 1, ago: 1 }] : [])];
    for (const t of tests) {
      const test = await gen.generate({ topic: TOPIC[course.level === 'Starter' ? 'Starter' : course.subject] ?? 'English grammar', count: 8, locale: 'uz', seed: fnv1a(`${g.key}:${t.k}`) });
      const tid = id(`test:${g.key}:${t.k}`);
      testRows.push([CENTRE_ID, tid, g.id, test.title, test.topic, 'local', json(test.questions), id('user:teacher'), at(addDays(today, -t.ago), 13)]);
      if (t.k === 1) continue;
      for (const e of members) {
        if (r() > 0.75 && e.student.name !== 'Aziz Karimov') continue;
        const answers = Object.fromEntries(test.questions.map((q) => [q.id, r() < 0.72 ? q.answer : (q.answer + 1) % q.options.length]));
        const res = gradeAttempt(test.questions, answers);
        attemptRows.push([CENTRE_ID, id(`att:${tid}:${e.student.id}`), tid, e.student.id, json(answers), res.correct, res.total, res.score, 180 + Math.floor(r() * 420), at(addDays(today, -t.ago + Math.floor(r() * 3)), 20)]);
      }
    }
  }
  await insertMany(tx, 'homework', ['centre_id', 'id', 'group_id', 'title', 'description', 'due_on', 'created_by', 'created_at'], hwRows);
  await insertMany(tx, 'submissions', ['centre_id', 'id', 'homework_id', 'student_id', 'kind', 'body', 'submitted_at', 'grade', 'feedback', 'graded_at'], subRows);
  await insertMany(tx, 'tests', ['centre_id', 'id', 'group_id', 'title', 'topic', 'source', 'questions', 'created_by', 'created_at'], testRows, 50);
  await insertMany(tx, 'test_attempts', ['centre_id', 'id', 'test_id', 'student_id', 'answers', 'correct', 'total', 'score', 'duration_sec', 'submitted_at'], attemptRows);

  // ── certificates for graduates of earlier courses ──
  const cr = rng(5);
  for (const [k, e] of p.enrollments.filter((x) => x.student.slot === 1).slice(0, 6).entries()) {
    const course = COURSES[(k + 2) % COURSES.length]!;
    const code = humanCode(cr, 8);
    const fields = { code, studentName: e.student.name, courseName: course.name, level: course.level, issuedOn: addDays(today, -20 - k * 9), centreName: 'Ustoz Academy' };
    await tx.query('insert into certificates (centre_id, id, code, student_id, course_id, student_name, course_name, level, issued_on, centre_name, signature) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
      CENTRE_ID, id(`cert:${k}`), code, e.student.id, id(`course:${course.key}`), fields.studentName, fields.courseName, fields.level, fields.issuedOn, fields.centreName, await signCertificate(certSecret, fields),
    ]);
  }

  // ── leads across the funnel ──
  const lr = rng(11);
  const leadRows: unknown[][] = [];
  const evRows: unknown[][] = [];
  const STAGES: LeadStage[] = ['new', 'new', 'new', 'placement', 'placement', 'trial', 'trial', 'enrolled', 'enrolled', 'lost'];
  for (let k = 0; k < 34; k++) {
    const stage = STAGES[k % STAGES.length]!;
    const ago = Math.floor(lr() * 55);
    const created = addDays(today, -ago);
    const isF = lr() < 0.5;
    const last = LAST[Math.floor(lr() * 20)]!;
    const name = `${(isF ? FIRST_F : FIRST_M)[Math.floor(lr() * 20)]} ${isF && /(ov|ev)$/.test(last) ? `${last}a` : last}`;
    const course = COURSES[Math.floor(lr() * COURSES.length)]!;
    const group = p.groups.find((g) => g.course === course.key && g.startsOn <= today) ?? p.groups[0]!;
    const reached: LeadStage = stage === 'lost' ? (lr() < 0.5 ? 'placement' : 'new') : stage;
    const score = reached === 'new' ? null : 20 + Math.floor(lr() * 75);
    const trialDate = stage === 'trial' ? (datesOn(group.days, addDays(today, k % 3 === 0 ? 0 : 1), addDays(today, 8))[0] ?? null) : stage === 'enrolled' ? addDays(created, 3) : null;
    const lid = id(`lead:${k}`);
    const touched = clamp(at(addDays(created, Math.min(ago, stage === 'new' ? 0 : 2)), 15));
    leadRows.push([CENTRE_ID, lid, name, `+99899${String(3_100_000 + k * 37).padStart(7, '0')}`, id(`course:${course.key}`), LEAD_SOURCES[Math.floor(lr() * LEAD_SOURCES.length)], stage, reached, score,
      score === null ? null : score < 25 ? 'beginner' : score < 45 ? 'elementary' : score < 65 ? 'pre_intermediate' : score < 85 ? 'intermediate' : 'upper_intermediate',
      stage === 'trial' || stage === 'enrolled' ? group.id : null, trialDate, stage === 'lost' ? 'Narx qimmatlik qildi' : null, clamp(at(created, 11)), touched]);
    evRows.push([CENTRE_ID, id(`lev:${k}:0`), lid, null, 'new', clamp(at(created, 11))]);
    if (stage !== 'new') evRows.push([CENTRE_ID, id(`lev:${k}:1`), lid, 'new', stage === 'lost' ? 'lost' : reached, touched]);
  }
  await insertMany(tx, 'leads', ['centre_id', 'id', 'full_name', 'phone', 'course_id', 'source', 'stage', 'reached', 'placement_score', 'level', 'trial_group_id', 'trial_date', 'lost_reason', 'created_at', 'updated_at'], leadRows);
  await insertMany(tx, 'lead_events', ['centre_id', 'id', 'lead_id', 'from_stage', 'to_stage', 'at'], evRows);
}
