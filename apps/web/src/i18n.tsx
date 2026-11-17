/** Locale state (Uzbek by default, remembered per browser) and formatting helpers. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { dayMonth, formatMoney, formatMoneyShort, monthName, monthShort, weekdayName } from '@ustoz/core';
import { wt } from '@ustoz/i18n';

export type Locale = 'uz' | 'ru' | 'en';
const KEY = 'ustoz.locale';

function initial(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'uz' || v === 'ru' || v === 'en') return v;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return 'uz';
}

interface I18n {
  l: Locale;
  setL(l: Locale): void;
  t(key: string, vars?: Record<string, string | number>): string;
  money(tiyin: number): string;
  moneyShort(tiyin: number): string;
  day(iso: string): string;
  wd(iso: string): string;
  month(m: string): string;
  monthShort(m: string): string;
}

const Ctx = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [l, setLState] = useState<Locale>(initial);
  const setL = useCallback((v: Locale) => {
    setLState(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = v;
  }, []);
  const value = useMemo<I18n>(
    () => ({
      l,
      setL,
      t: (key, vars) => wt(l, key, vars),
      money: (x) => formatMoney(x, l),
      moneyShort: (x) => formatMoneyShort(x, l),
      day: (d) => dayMonth(d, l),
      wd: (d) => weekdayName(d, l),
      month: (m) => monthName(m, l),
      monthShort: (m) => monthShort(m, l),
    }),
    [l, setL],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('LocaleProvider missing');
  return c;
}
