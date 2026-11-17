/**
 * A realistic phone frame (392:832, metal rim, side buttons, island, live status bar, home bar). The app
 * inside is laid out at 375 px and scaled with CSS `zoom` when the frame is narrower, so it always looks
 * like a real handset. On a real phone (≤600 px) the frame is dropped and the app fills the screen.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

const clock = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function PhoneStatus() {
  const [time, setTime] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="phone-status" aria-hidden="true">
      <span className="phone-clock">{time}</span>
      <span className="phone-icons">
        <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.5 10.5 0 0 0 8 .3 10.5 10.5 0 0 0 .5 3.4l1.3 1.3A8.7 8.7 0 0 1 8 2.2zm0 3.7c1.4 0 2.7.5 3.6 1.4l1.3-1.3A6.9 6.9 0 0 0 8 4a6.9 6.9 0 0 0-4.9 2l1.3 1.3c1-.9 2.2-1.4 3.6-1.4zm0 3.6c-.5 0-1 .2-1.3.6L8 11.4l1.3-1.3c-.3-.4-.8-.6-1.3-.6z" /></svg>
        <span className="phone-batt"><i /></span>
      </span>
    </div>
  );
}

/** Scales the 375 px app down to the frame's inner width (CSS zoom keeps hit-testing exact). */
function usePhoneZoom(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const phone = ref.current;
    const screen = phone?.querySelector<HTMLElement>('.phone-screen');
    if (!active || !phone || !screen) return;
    const fit = () => {
      const pad = Number.parseFloat(getComputedStyle(phone).paddingLeft) * 2;
      const w = phone.getBoundingClientRect().width - pad;
      const z = pad > 0 && w > 0 && w < 375 ? w / 375 : 1;
      screen.style.zoom = z < 1 ? String(z) : '';
      screen.style.width = z < 1 ? '375px' : '';
      screen.style.height = z < 1 ? `${(phone.getBoundingClientRect().height - pad) / z}px` : '';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(phone);
    return () => ro.disconnect();
  }, [active]);
  return ref;
}

export function useIsPhone() {
  const q = '(max-width: 600px)';
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

export function Phone({ children, label }: { children: ReactNode; label: string }) {
  const isPhone = useIsPhone();
  const ref = usePhoneZoom(!isPhone);
  if (isPhone) return <div className="phone-bare">{children}</div>;
  return (
    <div className="phone" ref={ref} aria-label={label} data-testid="phone-frame">
      <span className="phone-btn phone-btn-action" aria-hidden="true" />
      <span className="phone-btn phone-btn-vol-up" aria-hidden="true" />
      <span className="phone-btn phone-btn-vol-down" aria-hidden="true" />
      <span className="phone-btn phone-btn-power" aria-hidden="true" />
      <div className="phone-screen">
        <div className="phone-island" aria-hidden="true" />
        <PhoneStatus />
        <div className="phone-app">{children}</div>
        <span className="phone-homebar" aria-hidden="true" />
      </div>
    </div>
  );
}
