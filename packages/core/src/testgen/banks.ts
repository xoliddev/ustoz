/** Question banks for the local generator. English and IT items stay in English (that is the subject). */
import type { Locale } from './types';

export interface BankItem {
  prompt: string;
  options: string[];
  answer: number;
  explanation?: string;
}

export const ENGLISH_GRAMMAR: BankItem[] = [
  { prompt: 'She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], answer: 1, explanation: 'Present Simple, 3rd person singular: -s/-es.' },
  { prompt: 'They ___ football yesterday.', options: ['play', 'plays', 'played', 'playing'], answer: 2, explanation: 'Past Simple of a regular verb: -ed.' },
  { prompt: 'I ___ my homework right now.', options: ['do', 'am doing', 'did', 'have done'], answer: 1, explanation: '"right now" → Present Continuous.' },
  { prompt: 'We have lived here ___ 2019.', options: ['for', 'since', 'from', 'during'], answer: 1, explanation: '"since" + a point in time.' },
  { prompt: 'If it rains, we ___ at home.', options: ['stay', 'will stay', 'stayed', 'would stay'], answer: 1, explanation: 'First conditional: if + present, will + verb.' },
  { prompt: 'This is the ___ book I have ever read.', options: ['good', 'better', 'best', 'most good'], answer: 2, explanation: 'Superlative of "good" is "the best".' },
  { prompt: 'He ___ already finished the project.', options: ['has', 'have', 'is', 'was'], answer: 0, explanation: 'Present Perfect: has + V3 for he/she/it.' },
  { prompt: 'There isn\'t ___ milk in the fridge.', options: ['some', 'any', 'many', 'a'], answer: 1, explanation: 'Negative sentences take "any".' },
  { prompt: 'The letter ___ by my grandmother in 1985.', options: ['wrote', 'was written', 'is written', 'has written'], answer: 1, explanation: 'Past passive: was/were + V3.' },
  { prompt: 'I\'m looking forward ___ you.', options: ['to see', 'seeing', 'to seeing', 'see'], answer: 2, explanation: '"look forward to" + -ing.' },
  { prompt: 'She asked me where I ___.', options: ['live', 'lived', 'do live', 'am living'], answer: 1, explanation: 'Reported speech moves the tense back.' },
  { prompt: 'You ___ smoke here. It\'s forbidden.', options: ['mustn\'t', 'don\'t have to', 'needn\'t', 'shouldn\'t to'], answer: 0, explanation: '"mustn\'t" = prohibition.' },
  { prompt: 'By the time we arrived, the film ___.', options: ['started', 'has started', 'had started', 'starts'], answer: 2, explanation: 'Past Perfect for the earlier past action.' },
  { prompt: 'I wish I ___ more free time.', options: ['have', 'had', 'will have', 'am having'], answer: 1, explanation: 'wish + Past Simple for present wishes.' },
  { prompt: 'How ___ apples do you need?', options: ['much', 'many', 'lot', 'few of'], answer: 1, explanation: '"many" with countable nouns.' },
];

export const IELTS_VOCAB: BankItem[] = [
  { prompt: 'Choose the synonym of "significant".', options: ['considerable', 'tiny', 'random', 'temporary'], answer: 0 },
  { prompt: 'Choose the synonym of "decline" (noun).', options: ['growth', 'decrease', 'peak', 'plateau'], answer: 1 },
  { prompt: '"To mitigate" a problem means to…', options: ['ignore it', 'make it less severe', 'cause it', 'measure it'], answer: 1 },
  { prompt: 'The graph shows a ___ rise in sales (very fast).', options: ['gradual', 'steady', 'dramatic', 'slight'], answer: 2 },
  { prompt: 'Choose the antonym of "scarce".', options: ['rare', 'abundant', 'limited', 'expensive'], answer: 1 },
  { prompt: '"Consequently" is closest to…', options: ['however', 'therefore', 'although', 'meanwhile'], answer: 1 },
  { prompt: 'A "drawback" is a…', options: ['benefit', 'disadvantage', 'solution', 'reason'], answer: 1 },
  { prompt: 'Choose the correct collocation: ___ a conclusion.', options: ['make', 'reach', 'do', 'take'], answer: 1 },
  { prompt: '"Ubiquitous" means…', options: ['found everywhere', 'very old', 'hard to see', 'expensive'], answer: 0 },
  { prompt: 'Which word fits academic style best?', options: ['a lot of', 'tons of', 'a great deal of', 'loads of'], answer: 2 },
  { prompt: '"To fluctuate" means to…', options: ['stay the same', 'rise and fall', 'disappear', 'double'], answer: 1 },
  { prompt: 'Choose the synonym of "crucial".', options: ['essential', 'optional', 'minor', 'unclear'], answer: 0 },
];

export const PYTHON: BankItem[] = [
  { prompt: 'What does print(len("salom")) output?', options: ['4', '5', '6', 'Error'], answer: 1 },
  { prompt: 'Which type is [1, 2, 3]?', options: ['tuple', 'set', 'list', 'dict'], answer: 2 },
  { prompt: 'What is 7 // 2 in Python?', options: ['3.5', '3', '4', '1'], answer: 1 },
  { prompt: 'Which keyword defines a function?', options: ['func', 'def', 'function', 'lambda'], answer: 1 },
  { prompt: 'What does "abc"[-1] return?', options: ['"a"', '"b"', '"c"', 'Error'], answer: 2 },
  { prompt: 'Which collection keeps only unique items?', options: ['list', 'set', 'tuple', 'str'], answer: 1 },
  { prompt: 'What is the result of 2 ** 3?', options: ['6', '8', '9', '5'], answer: 1 },
  { prompt: 'How do you start a for-loop over 0..4?', options: ['for i in range(5):', 'for (i=0;i<5;i++)', 'loop i to 5:', 'for i in 5:'], answer: 0 },
  { prompt: 'Which value is falsy?', options: ['"0"', '[0]', '0', '" "'], answer: 2 },
  { prompt: 'What does dict.get("k", 0) return when "k" is missing?', options: ['None', 'KeyError', '0', '"k"'], answer: 2 },
  { prompt: 'Which statement handles exceptions?', options: ['try/except', 'catch/throw', 'if/else', 'with/as'], answer: 0 },
  { prompt: 'What does list.append(x) return?', options: ['the new list', 'None', 'x', 'the length'], answer: 1 },
];

const MATH_TEXT: Record<Locale, { percent: string; solve: string; area: string; avg: string }> = {
  uz: { percent: '{a} sonining {p}% i nechaga teng?', solve: 'Tenglamani yeching: {a}x + {b} = {c}', area: 'Tomonlari {a} va {b} bo\'lgan to\'rtburchakning yuzi?', avg: '{list} sonlarining o\'rta arifmetigi?' },
  ru: { percent: 'Сколько будет {p}% от {a}?', solve: 'Решите уравнение: {a}x + {b} = {c}', area: 'Площадь прямоугольника со сторонами {a} и {b}?', avg: 'Среднее арифметическое чисел {list}?' },
  en: { percent: 'What is {p}% of {a}?', solve: 'Solve: {a}x + {b} = {c}', area: 'Area of a rectangle with sides {a} and {b}?', avg: 'The average of {list}?' },
};

/** Procedural maths: unlimited, deterministic for a seed, answers computed (never guessed). */
export function mathItem(r: () => number, locale: Locale, kind: number): BankItem {
  const T = MATH_TEXT[locale];
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  let prompt: string;
  let right: number;
  switch (kind % 4) {
    case 0: {
      const p = [5, 10, 15, 20, 25, 30, 40, 50, 75][n(0, 8)]!;
      const a = n(2, 40) * 20;
      prompt = T.percent.replace('{p}', String(p)).replace('{a}', String(a));
      right = (a * p) / 100;
      break;
    }
    case 1: {
      const a = n(2, 9), x = n(-5, 12), b = n(1, 30);
      prompt = T.solve.replace('{a}', String(a)).replace('{b}', String(b)).replace('{c}', String(a * x + b));
      right = x;
      break;
    }
    case 2: {
      const a = n(3, 25), b = n(3, 25);
      prompt = T.area.replace('{a}', String(a)).replace('{b}', String(b));
      right = a * b;
      break;
    }
    default: {
      const k = n(3, 5);
      const base = n(2, 20);
      const list = Array.from({ length: k }, () => base + n(-2, 8) * 2);
      const sum = list.reduce((s, v) => s + v, 0);
      const fix = (k - (sum % k)) % k; // make the mean an integer
      list[0]! += fix;
      prompt = T.avg.replace('{list}', list.join(', '));
      right = (sum + fix) / k;
    }
  }
  const wrong = new Set<number>();
  for (const d of [1, -1, 2, -2, 5, 10, -10, 3]) {
    if (wrong.size >= 3) break;
    const v = right + d * (r() < 0.5 ? 1 : Math.max(1, Math.round(Math.abs(right) * 0.1)));
    if (v !== right) wrong.add(v);
  }
  const options = [right, ...wrong].slice(0, 4).map(String);
  return { prompt, options, answer: 0 };
}

export const TOPICS = [
  { key: 'english', match: /ingliz|english|англ|grammar|grammatika|tense|zamon/i },
  { key: 'ielts', match: /ielts|vocab|lug'at|so'z|слов/i },
  { key: 'python', match: /python|dastur|programm|програм|\bit\b|coding/i },
  { key: 'math', match: /math|matem|матем|algebra|алгебр|foiz|процент|percent|geometr/i },
] as const;
export type TopicKey = (typeof TOPICS)[number]['key'];
