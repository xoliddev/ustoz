/**
 * Timetable conflicts. A group meets on fixed weekdays at a fixed time in one room with one teacher,
 * between its start date and (optional) end date. Two groups clash when they share the room or the
 * teacher, their time windows overlap (half-open [start, end)), and there is at least one real calendar
 * date on which both meet.
 */
import { addDays, datesOn, diffDays, maxDate, minDate, type IsoDate } from './dates';

export interface Slot {
  id: string;
  label?: string;
  roomId: string | null;
  teacherId: string | null;
  days: readonly number[];
  /** minutes from midnight */
  start: number;
  end: number;
  from: IsoDate;
  to: IsoDate | null;
}

export type ConflictKind = 'room' | 'teacher';

export interface Conflict {
  a: string;
  b: string;
  kind: ConflictKind;
  days: number[];
  start: number;
  end: number;
  firstDate: IsoDate;
}

const FAR = '9999-12-31';

/** Weekdays both slots meet on, restricted to dates where both are running; plus the first such date. */
function sharedDays(a: Slot, b: Slot): { days: number[]; first: IsoDate | null } {
  const from = maxDate(a.from, b.from);
  const to = minDate(a.to ?? FAR, b.to ?? FAR);
  if (from > to) return { days: [], first: null };
  const common = a.days.filter((d) => b.days.includes(d));
  if (!common.length) return { days: [], first: null };
  // within any 7 consecutive days every weekday occurs once, so scanning one week is enough
  const scanTo = diffDays(to, from) >= 6 ? addDays(from, 6) : to;
  const dates = datesOn(common, from, scanTo);
  const days = [...new Set(dates.map((d) => ((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1))].sort();
  return { days, first: dates[0] ?? null };
}

export function slotsConflict(a: Slot, b: Slot): Conflict[] {
  if (a.id === b.id) return [];
  if (!(a.start < b.end && b.start < a.end)) return [];
  const kinds: ConflictKind[] = [];
  if (a.roomId && a.roomId === b.roomId) kinds.push('room');
  if (a.teacherId && a.teacherId === b.teacherId) kinds.push('teacher');
  if (!kinds.length) return [];
  const { days, first } = sharedDays(a, b);
  if (!days.length || !first) return [];
  return kinds.map((kind) => ({ a: a.id, b: b.id, kind, days, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end), firstDate: first }));
}

export function conflictsFor(candidate: Slot, others: readonly Slot[]): Conflict[] {
  return others.flatMap((o) => slotsConflict(candidate, o));
}

export function findConflicts(slots: readonly Slot[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) out.push(...slotsConflict(slots[i]!, slots[j]!));
  return out;
}

export function validSlotTimes(start: number, end: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 24 * 60 && end - start >= 30;
}

/** Concrete lessons of `slots` in [from, to]. */
export function lessonsBetween<T extends Slot>(slots: readonly T[], from: IsoDate, to: IsoDate): Array<{ slot: T; date: IsoDate }> {
  const out: Array<{ slot: T; date: IsoDate }> = [];
  for (const s of slots) {
    const f = maxDate(from, s.from);
    const t = minDate(to, s.to ?? FAR);
    for (const date of datesOn(s.days, f, t)) out.push({ slot: s, date });
  }
  return out.sort((x, y) => (x.date === y.date ? x.slot.start - y.slot.start : x.date < y.date ? -1 : 1));
}
