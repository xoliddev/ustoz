/**
 * Calendar maths on plain "YYYY-MM-DD" strings (centre-local dates) and "YYYY-MM" months.
 * Everything goes through UTC milliseconds, so no host time zone or DST can shift a day.
 * Uzbekistan is UTC+5 all year; `todayIn` turns an instant into the centre's local date.
 */
export type IsoDate = string; // YYYY-MM-DD
export type Month = string; // YYYY-MM
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: Monday = 1

const DAY = 86_400_000;
export const TASHKENT_OFFSET_MIN = 300;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function parseDate(d: IsoDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new RangeError(`bad date ${d}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (fmtDate(ms) !== d) throw new RangeError(`bad date ${d}`);
  return ms;
}

export function fmtDate(ms: number): IsoDate {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

export const isIsoDate = (d: string): boolean => {
  try {
    parseDate(d);
    return true;
  } catch {
    return false;
  }
};

/** The local calendar date at instant `now` for a fixed UTC offset (minutes). */
export function todayIn(now: Date, offsetMin = TASHKENT_OFFSET_MIN): IsoDate {
  return fmtDate(now.getTime() + offsetMin * 60_000);
}

/** Minutes since local midnight at instant `now`. */
export function minuteOfDay(now: Date, offsetMin = TASHKENT_OFFSET_MIN): number {
  const local = now.getTime() + offsetMin * 60_000;
  return Math.floor((((local % DAY) + DAY) % DAY) / 60_000);
}

export const addDays = (d: IsoDate, n: number): IsoDate => fmtDate(parseDate(d) + n * DAY);
export const diffDays = (a: IsoDate, b: IsoDate): number => Math.round((parseDate(a) - parseDate(b)) / DAY);

export function weekday(d: IsoDate): Weekday {
  const w = new Date(parseDate(d)).getUTCDay();
  return (w === 0 ? 7 : w) as Weekday;
}

/** Monday of the week containing d. */
export const weekStart = (d: IsoDate): IsoDate => addDays(d, 1 - weekday(d));

export const monthOf = (d: IsoDate): Month => d.slice(0, 7);

export function parseMonth(m: Month): { y: number; mo: number } {
  const r = /^(\d{4})-(\d{2})$/.exec(m);
  if (!r || Number(r[2]) < 1 || Number(r[2]) > 12) throw new RangeError(`bad month ${m}`);
  return { y: Number(r[1]), mo: Number(r[2]) };
}

export const isMonth = (m: string): boolean => {
  try {
    parseMonth(m);
    return true;
  } catch {
    return false;
  }
};

export function addMonths(m: Month, n: number): Month {
  const { y, mo } = parseMonth(m);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function daysInMonth(m: Month): number {
  const { y, mo } = parseMonth(m);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export const monthStart = (m: Month): IsoDate => `${m}-01`;
export const monthEnd = (m: Month): IsoDate => `${m}-${pad(daysInMonth(m))}`;

export const maxDate = (a: IsoDate, b: IsoDate): IsoDate => (a > b ? a : b);
export const minDate = (a: IsoDate, b: IsoDate): IsoDate => (a < b ? a : b);

/** Every date in [from, to] (inclusive) falling on one of `days`. */
export function datesOn(days: readonly number[], from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  if (from > to) return out;
  const set = new Set(days);
  for (let ms = parseDate(from), end = parseDate(to); ms <= end; ms += DAY) {
    const w = new Date(ms).getUTCDay();
    if (set.has(w === 0 ? 7 : w)) out.push(fmtDate(ms));
  }
  return out;
}

/** "HH:MM" → minutes. */
export function parseTime(t: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) throw new RangeError(`bad time ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export const fmtTime = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

const MONTHS: Record<string, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_GEN: Record<string, string[]> = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
export const WEEKDAYS: Record<string, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

export function monthName(m: Month, locale = 'uz'): string {
  const { y, mo } = parseMonth(m);
  const name = (MONTHS[locale] ?? MONTHS.uz!)[mo - 1]!;
  return `${locale === 'en' ? name : name[0]!.toUpperCase() + name.slice(1)} ${y}`;
}

/** "18-noyabr" / "18 ноября" / "18 Nov". */
export function dayMonth(d: IsoDate, locale = 'uz'): string {
  const { mo } = parseMonth(monthOf(d));
  const day = Number(d.slice(8));
  if (locale === 'ru') return `${day} ${MONTHS_GEN.ru![mo - 1]}`;
  if (locale === 'en') return `${day} ${MONTHS.en![mo - 1]!.slice(0, 3)}`;
  return `${day}-${MONTHS.uz![mo - 1]}`;
}

export const weekdayName = (d: IsoDate, locale = 'uz'): string => (WEEKDAYS[locale] ?? WEEKDAYS.uz!)[weekday(d) - 1]!;
