/**
 * Deterministic local test generator (no API key, no network): same input → same test.
 *  - topic: picks from a curated bank (English grammar, IELTS vocabulary, Python) or builds maths items
 *    procedurally with computed answers;
 *  - pasted text: builds fill-in-the-gap questions — a key term is blanked out of a sentence and the
 *    distractors are other key terms from the same text.
 */
import { DomainError } from '../errors';
import { fnv1a, rng, shuffle } from '../ids';
import { ENGLISH_GRAMMAR, IELTS_VOCAB, mathItem, PYTHON, TOPICS, type BankItem, type TopicKey } from './banks';
import { sanitizeQuestions, type GenerateInput, type GeneratedTest, type Locale, type TestGenerator } from './types';

const STOP = new Set(
  ('the a an and or but of to in on at for with from by is are was were be been this that these those it its as into than then there their they them ' +
    'va bilan uchun bu u ular yoki ham emas edi esa lekin ammo kabi bo\'lib bo\'lgan qilib orqali har biz siz men sen ' +
    'и в во на с со по к ко из за от до для это как что не но или а же бы ли так его её их мы вы он она они')
    .split(/\s+/),
);

const BLANK: Record<Locale, string> = { uz: 'Bo\'sh joyni to\'ldiring', ru: 'Заполните пропуск', en: 'Fill in the gap' };
const TITLE: Record<Locale, (t: string) => string> = { uz: (t) => `${t}: test`, ru: (t) => `Тест: ${t}`, en: (t) => `${t} quiz` };

function fromBank(bank: readonly BankItem[], r: () => number, count: number): BankItem[] {
  return shuffle(r, bank).slice(0, Math.min(count, bank.length));
}

function shuffleOptions(item: BankItem, r: () => number): BankItem {
  const order = shuffle(r, item.options.map((_, i) => i));
  return { ...item, options: order.map((i) => item.options[i]!), answer: order.indexOf(item.answer) };
}

export function detectTopic(topic: string): TopicKey | null {
  return TOPICS.find((t) => t.match.test(topic))?.key ?? null;
}

const words = (s: string) => s.match(/[\p{L}\p{N}'ʻʼ-]+/gu) ?? [];

/** Candidate key terms of a text: longer, non-stopword tokens and numbers, by frequency then length. */
export function keyTerms(text: string): string[] {
  const freq = new Map<string, { w: string; n: number }>();
  for (const w of words(text)) {
    const k = w.toLowerCase();
    if (STOP.has(k) || (k.length < 5 && !/^\d{2,}$/.test(k))) continue;
    const e = freq.get(k) ?? { w, n: 0 };
    e.n++;
    freq.set(k, e);
  }
  return [...freq.values()].sort((a, b) => b.n - a.n || b.w.length - a.w.length || (a.w < b.w ? -1 : 1)).map((e) => e.w);
}

function fromText(text: string, r: () => number, count: number, locale: Locale): BankItem[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length >= 5 && s.length <= 400);
  const terms = keyTerms(text);
  if (sentences.length < 2 || terms.length < 4) throw new DomainError('VALIDATION', 'Text is too short to build a test', { reason: 'TEXT_TOO_SHORT' });
  const used = new Set<string>();
  const items: BankItem[] = [];
  for (const s of shuffle(r, sentences)) {
    if (items.length >= count) break;
    const inSentence = words(s).filter((w) => terms.includes(w) && !used.has(w.toLowerCase()));
    if (!inSentence.length) continue;
    const key = inSentence.sort((a, b) => b.length - a.length)[0]!;
    used.add(key.toLowerCase());
    const isNum = /^\d+$/.test(key);
    const pool = terms.filter((t) => t.toLowerCase() !== key.toLowerCase() && /^\d+$/.test(t) === isNum);
    const distractors = isNum && pool.length < 3 ? [String(Number(key) + 1), String(Number(key) - 1), String(Number(key) * 2)] : shuffle(r, pool).slice(0, 3);
    if (distractors.length < 2) continue;
    const prompt = `${BLANK[locale]}: ${s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u'), '$1_____')}`;
    items.push(shuffleOptions({ prompt, options: [key, ...distractors], answer: 0 }, r));
  }
  if (!items.length) throw new DomainError('VALIDATION', 'Text is too short to build a test', { reason: 'TEXT_TOO_SHORT' });
  return items;
}

export class LocalTestGenerator implements TestGenerator {
  readonly name = 'local' as const;

  async generate(input: GenerateInput): Promise<GeneratedTest> {
    const count = Math.max(3, Math.min(20, input.count));
    const text = input.text?.trim() ?? '';
    const topic = input.topic?.trim() ?? '';
    const seed = input.seed ?? fnv1a(`${topic}|${text}|${count}|${input.locale}`);
    const r = rng(seed);
    let items: BankItem[];
    let title = topic;
    if (text) {
      items = fromText(text, r, count, input.locale);
      title = topic || words(text).slice(0, 4).join(' ');
    } else {
      const key = detectTopic(topic);
      if (!key) throw new DomainError('VALIDATION', 'Unknown topic: paste a text or choose a listed topic', { reason: 'UNKNOWN_TOPIC', topics: TOPICS.map((t) => t.key) });
      if (key === 'math') items = Array.from({ length: count }, (_, i) => shuffleOptions(mathItem(r, input.locale, i), r));
      else items = fromBank(key === 'english' ? ENGLISH_GRAMMAR : key === 'ielts' ? IELTS_VOCAB : PYTHON, r, count).map((it) => shuffleOptions(it, r));
    }
    return { title: TITLE[input.locale](title.slice(0, 60)), topic: topic || title, questions: sanitizeQuestions(items), source: 'local' };
  }
}
