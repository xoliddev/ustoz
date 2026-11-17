/**
 * Simulated Telegram chat with the Ustoz bot. Replies come from the real bot engine (@ustoz/botkit) and
 * notifications from the real outbox templates (@ustoz/i18n renderNotification) — the same text the
 * production bot sends. New notifications appear live (e.g. right after a teacher marks an absence).
 */
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BotInput, BotReply, Button } from '@ustoz/botkit';
import type { Role } from '@ustoz/core';
import { renderNotification } from '@ustoz/i18n';
import { useApi, useData } from '../api/context';
import { useT } from '../i18n';
import { Icon } from '../ui/icons';
import { fakeNotebookPhoto } from './photo';

interface Msg {
  id: string;
  at: number;
  from: 'bot' | 'me';
  html?: string;
  text?: string;
  photo?: string;
  inline?: Button[][];
  notification?: boolean;
}

/** Renders the bot's Telegram-HTML (only <b> is used; everything else arrives escaped). */
function TgText({ html }: { html: string }) {
  const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const parts = html.split(/(<b>.*?<\/b>)/gs);
  return (
    <>
      {parts.map((p, i) => {
        const bold = /^<b>(.*)<\/b>$/s.exec(p);
        const text = unescape(bold ? bold[1]! : p);
        const lines = text.split('\n');
        const body: ReactNode = lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{l}</Fragment>);
        return bold ? <b key={i}>{body}</b> : <Fragment key={i}>{body}</Fragment>;
      })}
    </>
  );
}

const hhmm = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function BotChat({ persona }: { persona: Role }) {
  const { t, l } = useT();
  const api = useApi();
  const feed = useData(persona, 'notifications.mine', {});
  const [convo, setConvo] = useState<Msg[]>([]);
  const [keyboard, setKeyboard] = useState<Button[][] | null>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const started = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const push = (replies: BotReply[]) => {
    const now = Date.now();
    setConvo((c) => [...c, ...replies.map((r, i) => ({ id: `b${now}-${i}`, at: now + i, from: 'bot' as const, html: r.text, inline: r.inline }))]);
    const kb = [...replies].reverse().find((r) => r.reply)?.reply;
    if (kb) setKeyboard(kb);
  };

  const send = async (input: BotInput, echo?: Partial<Msg>) => {
    if (echo) setConvo((c) => [...c, { id: `m${Date.now()}`, at: Date.now(), from: 'me', ...echo }]);
    if (!api.bot) return;
    setTyping(true);
    try {
      push(await api.bot(persona, input));
    } finally {
      setTyping(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send({ kind: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messages = useMemo(() => {
    const notes: Msg[] = (feed.data ?? []).map((n) => ({ id: n.id, at: Date.parse(n.createdAt), from: 'bot', html: renderNotification(n.template, n.params, n.locale === 'ru' || n.locale === 'en' ? n.locale : l), notification: true }));
    return [...notes, ...convo].sort((a, b) => a.at - b.at);
  }, [feed.data, convo, l]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typing]);

  const press = (b: Button) => {
    if (b.webApp) return;
    if (b.data) return void send({ kind: 'button', data: b.data });
    void send({ kind: 'text', text: b.text }, { text: b.text });
  };

  return (
    <div className="chat" data-testid={`bot-${persona}`}>
      <div className="chat-head">
        <span className="chat-ava">U</span>
        <div><b>Ustoz Academy</b><small>{t('bot.online')}</small></div>
      </div>
      <div className="chat-scroll" ref={scroller}>
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} className={`msg ${m.from}${m.notification ? ' note' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }} data-testid={m.notification ? 'bot-notification' : 'bot-message'}>
              {m.photo && <img src={m.photo} alt="" className="msg-photo" />}
              {m.html ? <span><TgText html={m.html} /></span> : <span>{m.text}</span>}
              <small className="msg-time">{hhmm(m.at)}{m.from === 'me' && ' ✓✓'}</small>
              {m.inline && (
                <div className="msg-inline">
                  {m.inline.map((row, i) => <div key={i} className="msg-inline-row">{row.map((b) => <button key={b.text + (b.data ?? '')} onClick={() => press(b)}>{b.text}</button>)}</div>)}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {typing && <div className="msg bot typing" aria-label="typing"><i /><i /><i /></div>}
      </div>
      {keyboard && (
        <div className="chat-kb">
          {keyboard.map((row, i) => (
            <div key={i} className="chat-kb-row">
              {row.map((b) => <button key={b.text} onClick={() => press(b)} className={b.webApp ? 'webapp' : ''} data-testid="kb-button">{b.text}</button>)}
            </div>
          ))}
        </div>
      )}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (!v) return; setText(''); void send({ kind: 'text', text: v }, { text: v }); }}>
        {persona === 'student' && (
          <button type="button" className="chat-attach" aria-label={t('bot.attachPhoto')} title={t('bot.attachPhoto')} onClick={() => { const photo = fakeNotebookPhoto(); void send({ kind: 'photo', fileName: 'daftar.png', dataUrl: photo }, { photo, text: '' }); }}>
            <Icon name="paperclip" />
          </button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('bot.placeholder')} aria-label={t('bot.placeholder')} />
        <button type="submit" className="chat-send" aria-label={t('mini.send')} disabled={!text.trim()}><Icon name="send" /></button>
      </form>
    </div>
  );
}
