/** Test generator port: the demo uses the deterministic local generator, production may plug in Gemini or Claude. */
import { DomainError } from '../errors';

export type Locale = 'uz' | 'ru' | 'en';

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  /** index into options */
  answer: number;
  explanation?: string;
}

export interface GeneratedTest {
  title: string;
  topic: string;
  questions: Question[];
  source: 'local' | 'gemini' | 'claude';
}

export interface GenerateInput {
  topic?: string;
  text?: string;
  count: number;
  locale: Locale;
  seed?: number;
}

export interface TestGenerator {
  readonly name: GeneratedTest['source'];
  generate(input: GenerateInput): Promise<GeneratedTest>;
}

const clean = (s: unknown, max: number): string =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * Validates and normalizes questions from any source (AI output is untrusted): 2–6 distinct options,
 * an in-range answer, bounded lengths, no markup. Throws if nothing usable is left.
 */
export function sanitizeQuestions(raw: unknown, idPrefix = 'q'): Question[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Question[] = [];
  for (const q of list.slice(0, 50)) {
    if (!q || typeof q !== 'object') continue;
    const r = q as Record<string, unknown>;
    const prompt = clean(r.prompt ?? r.question, 400);
    const options = (Array.isArray(r.options) ? r.options : []).map((o) => clean(o, 160)).filter(Boolean);
    const answer = Number(r.answer ?? r.correct);
    if (!prompt || options.length < 2 || options.length > 6 || new Set(options).size !== options.length) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    const explanation = clean(r.explanation, 300);
    out.push({ id: `${idPrefix}${out.length + 1}`, prompt, options, answer, ...(explanation ? { explanation } : {}) });
  }
  if (!out.length) throw new DomainError('VALIDATION', 'The generator returned no usable questions');
  return out;
}

export interface AttemptResult {
  correct: number;
  total: number;
  /** 0–100 */
  score: number;
  answers: Array<{ id: string; chosen: number | null; correct: boolean }>;
}

/** Grades an attempt. Unknown or missing answers count as wrong. */
export function gradeAttempt(questions: readonly Question[], answers: Readonly<Record<string, number | null | undefined>>): AttemptResult {
  const rows = questions.map((q) => {
    const chosen = answers[q.id];
    const c = typeof chosen === 'number' && Number.isInteger(chosen) ? chosen : null;
    return { id: q.id, chosen: c, correct: c === q.answer };
  });
  const correct = rows.filter((r) => r.correct).length;
  return { correct, total: questions.length, score: questions.length ? Math.round((correct * 100) / questions.length) : 0, answers: rows };
}
