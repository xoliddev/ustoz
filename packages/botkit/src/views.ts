/** Bot message bodies for each menu section (HTML, escaped). */
import { dayMonth, fmtTime, weekdayName, type Role } from '@ustoz/core';
import type { Actor } from '@ustoz/db';
import { bt, esc, type Locale } from '@ustoz/i18n';
import { childrenOf, type BotDeps, type BotReply } from './engine';

export async function scheduleText(deps: BotDeps, actor: Actor, l: Locale): Promise<string> {
  const kids = await deps.call(actor, 'family.children', {});
  const week = await deps.call(actor, 'schedule.week', {});
  const out: string[] = [];
  for (const k of kids) {
    const mine = week.lessons.filter((x) => k.groups.includes(x.name) && x.date >= week.today);
    out.push(bt(l, 'schedule_title', { name: esc(k.fullName) }));
    if (!mine.length) out.push(bt(l, 'schedule_empty'));
    for (const x of mine) out.push(`${x.date === week.today ? '▸ ' : ''}${weekdayName(x.date, l)}, ${dayMonth(x.date, l)} · <b>${fmtTime(x.startMin)}–${fmtTime(x.endMin)}</b>\n   ${esc(x.name)} · ${esc(x.roomName ?? '')} · ${esc(x.teacherName ?? '')}`);
    out.push('');
  }
  return out.join('\n').trim();
}

export async function homeworkText(deps: BotDeps, actor: Actor, role: Role, l: Locale): Promise<BotReply> {
  const kids = await childrenOf(deps, actor);
  const lines: string[] = [bt(l, 'hw_title')];
  const inline: BotReply['inline'] = [];
  for (const k of kids) {
    const list = (await deps.call(actor, 'homework.mine', { studentId: k.id })).slice(0, 6);
    if (kids.length > 1) lines.push(`\n<b>${esc(k.name)}</b>`);
    if (!list.length) lines.push(bt(l, 'hw_empty'));
    for (const h of list) {
      const state = h.grade !== null ? `✓ ${h.grade}/100` : h.submissionId ? '•' : '○';
      lines.push(bt(l, 'hw_item', { state, title: esc(h.title), group: esc(h.groupName), due: dayMonth(h.dueOn, l) }));
      if (role === 'student' && h.grade === null) inline.push([{ text: `${bt(l, 'btn.submit')}: ${h.title.slice(0, 40)}`, data: `hw:${h.id}` }]);
    }
  }
  return { text: lines.join('\n'), ...(inline.length ? { inline: inline.slice(0, 5) } : {}) };
}

export async function gradesText(deps: BotDeps, actor: Actor, l: Locale): Promise<string> {
  const kids = await childrenOf(deps, actor);
  const parts: string[] = [];
  for (const k of kids) {
    const p = await deps.call(actor, 'progress.student', { studentId: k.id });
    const recent = [...p.homework.map((h) => ({ date: h.date, title: h.title, score: h.grade })), ...p.tests.map((t) => ({ date: t.date, title: t.title, score: t.score }))]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6);
    const att = p.attendance.reduce((s, x) => ({ ok: s.ok + x.present + x.late, all: s.all + x.present + x.late + x.absent }), { ok: 0, all: 0 });
    parts.push(bt(l, 'grades_title', { name: esc(p.fullName) }));
    if (!recent.length) parts.push(bt(l, 'grades_empty'));
    for (const r of recent) parts.push(`${dayMonth(r.date, l)} · ${esc(r.title)} — <b>${r.score}</b>`);
    parts.push(bt(l, 'grades_avg', { hw: p.averages.homework ?? '—', tests: p.averages.tests ?? '—', att: att.all ? `${Math.round((att.ok * 100) / att.all)}%` : '—' }));
    parts.push('');
  }
  return parts.join('\n').trim();
}

export async function todayText(deps: BotDeps, actor: Actor, l: Locale): Promise<string> {
  const t = await deps.call(actor, 'attendance.today', {});
  if (!t.lessons.length) return `${bt(l, 'today_title')}\n${bt(l, 'schedule_empty')}`;
  return [bt(l, 'today_title'), ...t.lessons.map((x) => `<b>${fmtTime(x.startMin)}–${fmtTime(x.endMin)}</b> ${esc(x.name)} · ${esc(x.roomName ?? '')} · ${x.marked}/${x.students}`)].join('\n');
}
