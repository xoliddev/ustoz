/** UI primitives: drawer, modal, toasts, empty/skeleton states, money, avatar, segmented control, number ticker. */
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Icon } from './icons';

// ── toasts ──
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, bad }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), bad ? 5200 : 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((x) => (
            <motion.div key={x.id} className={`toast${x.bad ? ' bad' : ''}`} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              {x.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Turns a thrown API error into a readable toast. */
export function useErrorToast() {
  const toast = useToast();
  return useCallback((e: unknown) => toast(e instanceof Error ? e.message : String(e), true), [toast]);
}

// ── overlays ──
export function Drawer({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose(): void; children: ReactNode }) {
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <div className="drawer-head">
              <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label={t('c.back')}><Icon name="back" /></button>
              <h2 className="grow ellipsis">{title}</h2>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose(): void; children: ReactNode }) {
  const { t } = useT();
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} initial={{ y: 14, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, opacity: 0 }}>
            <div className="spread">
              <h2>{title}</h2>
              <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label={t('c.close')}><Icon name="close" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── states ──
export function Empty({ text, icon = 'sparkle' }: { text?: string; icon?: Parameters<typeof Icon>[0]['name'] }) {
  const { t } = useT();
  return (
    <div className="empty">
      <Icon name={icon} size={22} />
      <span>{text ?? t('c.empty')}</span>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack-sm" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={38} />)}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: Error; retry?(): void }) {
  const { t } = useT();
  return (
    <div className="card row" style={{ borderColor: 'var(--bad-soft)' }} role="alert">
      <Icon name="alert" />
      <span className="grow">{error.message}</span>
      {retry && <button className="btn btn-sm" onClick={retry}>{t('boot.retry')}</button>}
    </div>
  );
}

// ── small pieces ──
export function Money({ v, short }: { v: number; short?: boolean }) {
  const { money, moneyShort } = useT();
  return <span className="num">{short ? moneyShort(v) : money(v)}</span>;
}

const PALETTE = ['#e2561b', '#3f3cbb', '#138a4b', '#b7700a', '#c8331f', '#0e7490', '#7c3aed', '#be185d'];
export function Avatar({ name, size = 32, color }: { name: string; size?: number; color?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? PALETTE[h % PALETTE.length] }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ v: NoInfer<T>; label: string }>; onChange: (v: NoInfer<T>) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Animated number (counts up when the value changes). */
export function Ticker({ value, format }: { value: number; format(v: number): string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className="num">{text}</motion.span>;
}
