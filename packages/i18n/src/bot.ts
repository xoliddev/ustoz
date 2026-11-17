/**
 * Bot copy in Uzbek (default), Russian and English. Notification templates are rendered from the outbox
 * row's template + params, so the real bot and the demo's simulated chat print exactly the same text.
 * Telegram HTML parse mode: every user-supplied value is escaped.
 */
import { dayMonth, formatMoney } from '@ustoz/core';

export type Locale = 'uz' | 'ru' | 'en';
export const LOCALES: Locale[] = ['uz', 'ru', 'en'];

export const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Dict = Record<string, [string, string, string]>;

/** [uz, ru, en] */
export const BOT: Dict = {
  'btn.schedule': ['Dars jadvali', 'Расписание', 'Schedule'],
  'btn.balance': ['Balans va to\'lov', 'Баланс и оплата', 'Balance & pay'],
  'btn.homework': ['Uy vazifalar', 'Домашние задания', 'Homework'],
  'btn.grades': ['Baholar', 'Оценки', 'Grades'],
  'btn.app': ['Ilovani ochish', 'Открыть приложение', 'Open the app'],
  'btn.language': ['Til', 'Язык', 'Language'],
  'btn.back': ['Orqaga', 'Назад', 'Back'],
  'btn.share_phone': ['Telefon raqamni yuborish', 'Отправить номер', 'Share my phone number'],
  'btn.submit': ['Topshirish', 'Сдать', 'Submit'],
  'btn.cancel': ['Bekor qilish', 'Отмена', 'Cancel'],
  'btn.today': ['Bugungi darslar', 'Уроки сегодня', 'Today\'s lessons'],
  welcome_new: [
    'Assalomu alaykum! <b>{centre}</b> botiga xush kelibsiz.\nO\'quv markazida ro\'yxatdan o\'tgan telefon raqamingizni yuboring — shunda jadval, to\'lov va baholarni shu yerda ko\'rasiz.',
    'Здравствуйте! Добро пожаловать в бот <b>{centre}</b>.\nОтправьте номер телефона, указанный в учебном центре, — и здесь появятся расписание, оплата и оценки.',
    'Hello! Welcome to the <b>{centre}</b> bot.\nShare the phone number you gave the learning centre to see your schedule, payments and grades here.',
  ],
  welcome: ['Assalomu alaykum, <b>{name}</b>! Kerakli bo\'limni tanlang.', 'Здравствуйте, <b>{name}</b>! Выберите раздел.', 'Hello, <b>{name}</b>! Choose a section.'],
  linked: ['Raqamingiz tasdiqlandi. Endi barcha xabarlar shu yerga keladi.', 'Номер подтверждён. Теперь все уведомления будут приходить сюда.', 'Your number is confirmed. All updates will come here now.'],
  not_found: ['Bu raqam o\'quv markazi bazasida topilmadi. Administrator bilan bog\'laning.', 'Этот номер не найден в базе центра. Свяжитесь с администратором.', 'This number is not in the centre\'s records. Please contact the administrator.'],
  contact_not_own: ['Iltimos, o\'zingizning raqamingizni tugma orqali yuboring.', 'Пожалуйста, отправьте свой номер кнопкой.', 'Please share your own number using the button.'],
  choose_child: ['Qaysi farzandingiz?', 'Какой ребёнок?', 'Which child?'],
  schedule_title: ['<b>{name}</b> — shu haftalik jadval:', '<b>{name}</b> — расписание на неделю:', '<b>{name}</b> — this week:'],
  schedule_empty: ['Bu hafta dars yo\'q.', 'На этой неделе уроков нет.', 'No lessons this week.'],
  balance: [
    '<b>{name}</b>\nQarz: <b>{debt}</b>\nMuddati o\'tgan: {overdue}\nOxirgi to\'lov: {last}',
    '<b>{name}</b>\nДолг: <b>{debt}</b>\nПросрочено: {overdue}\nПоследний платёж: {last}',
    '<b>{name}</b>\nDebt: <b>{debt}</b>\nOverdue: {overdue}\nLast payment: {last}',
  ],
  balance_ok: ['<b>{name}</b>\nQarz yo\'q. Rahmat! Oldindan to\'langan: {credit}', '<b>{name}</b>\nДолга нет. Спасибо! Аванс: {credit}', '<b>{name}</b>\nNo debt. Thank you! Prepaid: {credit}'],
  pay_hint: ['To\'lash uchun ilovani oching: Payme, Click yoki Uzum.', 'Оплатить можно в приложении: Payme, Click или Uzum.', 'Pay in the app with Payme, Click or Uzum.'],
  none: ['yo\'q', 'нет', 'none'],
  hw_title: ['Uy vazifalar:', 'Домашние задания:', 'Homework:'],
  hw_empty: ['Hozircha uy vazifa yo\'q.', 'Пока заданий нет.', 'No homework for now.'],
  hw_item: ['{state} <b>{title}</b> — {group}, muddat {due}', '{state} <b>{title}</b> — {group}, до {due}', '{state} <b>{title}</b> — {group}, due {due}'],
  hw_send: ['«{title}» uchun javobingizni yuboring: matn, rasm yoki fayl.', 'Отправьте ответ на «{title}»: текст, фото или файл.', 'Send your answer for "{title}": text, photo or file.'],
  hw_done: ['Qabul qilindi! «{title}» o\'qituvchiga yuborildi.', 'Принято! «{title}» отправлено учителю.', 'Received! "{title}" was sent to your teacher.'],
  hw_redone: ['Yangilandi! «{title}» uchun yangi javob saqlandi.', 'Обновлено! Новый ответ на «{title}» сохранён.', 'Updated! Your new answer for "{title}" is saved.'],
  hw_graded_already: ['Bu vazifa baholangan, qayta topshirib bo\'lmaydi.', 'Задание уже оценено, пересдать нельзя.', 'This homework is already graded and cannot be resubmitted.'],
  grades_title: ['<b>{name}</b> — baholar:', '<b>{name}</b> — оценки:', '<b>{name}</b> — grades:'],
  grades_avg: ['O\'rtacha: uy vazifa {hw}, test {tests}. Davomat: {att}', 'Средний: ДЗ {hw}, тесты {tests}. Посещаемость: {att}', 'Average: homework {hw}, tests {tests}. Attendance: {att}'],
  grades_empty: ['Hali baho yo\'q.', 'Оценок пока нет.', 'No grades yet.'],
  lang_set: ['Til o\'zgartirildi.', 'Язык изменён.', 'Language changed.'],
  unknown: ['Tugmalardan birini tanlang.', 'Выберите кнопку.', 'Please choose a button.'],
  staff_hint: ['Siz xodimsiz: davomat va boshqaruv ilovada.', 'Вы сотрудник: посещаемость и управление в приложении.', 'You are staff: attendance and management are in the app.'],
  today_title: ['Bugungi darslar:', 'Уроки сегодня:', 'Today\'s lessons:'],
  error: ['Xatolik yuz berdi. Keyinroq urinib ko\'ring.', 'Произошла ошибка. Попробуйте позже.', 'Something went wrong. Please try again later.'],

  // ── notifications (outbox templates) ──
  'n.absent': [
    '<b>{student}</b> bugun darsga kelmadi.\n{group} · {date}, {time}{streak}',
    '<b>{student}</b> сегодня не пришёл(ла) на урок.\n{group} · {date}, {time}{streak}',
    '<b>{student}</b> missed today\'s lesson.\n{group} · {date}, {time}{streak}',
  ],
  'n.absent_streak': ['\nKetma-ket {n}-dars qoldirildi. Iltimos, sababini ma\'lum qiling.', '\nПропущено {n} урока подряд. Пожалуйста, сообщите причину.', '\n{n} lessons missed in a row. Please let us know why.'],
  'n.late': ['<b>{student}</b> darsga kechikib keldi.\n{group} · {date}, {time}', '<b>{student}</b> опоздал(а) на урок.\n{group} · {date}, {time}', '<b>{student}</b> was late for the lesson.\n{group} · {date}, {time}'],
  'n.payment_received': [
    'To\'lov qabul qilindi: <b>{amount}</b> ({method}).\nKvitansiya {receipt}. Balans: {balance}',
    'Оплата получена: <b>{amount}</b> ({method}).\nКвитанция {receipt}. Баланс: {balance}',
    'Payment received: <b>{amount}</b> ({method}).\nReceipt {receipt}. Balance: {balance}',
  ],
  'n.payment_reminder': [
    'Eslatma: <b>{student}</b> uchun to\'lov — <b>{debt}</b>{overdue}.\nTo\'lovni ilovada Payme, Click yoki Uzum orqali qilishingiz mumkin.',
    'Напоминание: оплата за <b>{student}</b> — <b>{debt}</b>{overdue}.\nОплатить можно в приложении через Payme, Click или Uzum.',
    'Reminder: tuition for <b>{student}</b> — <b>{debt}</b>{overdue}.\nYou can pay in the app with Payme, Click or Uzum.',
  ],
  'n.overdue_part': [', shundan {x} muddati o\'tgan', ', из них просрочено {x}', ', of which {x} is overdue'],
  'n.homework_new': ['Yangi uy vazifa: <b>{title}</b>\n{group} · muddat {due}', 'Новое задание: <b>{title}</b>\n{group} · до {due}', 'New homework: <b>{title}</b>\n{group} · due {due}'],
  'n.homework_graded': ['<b>{student}</b>: «{title}» — <b>{grade}/100</b>\n{feedback}', '<b>{student}</b>: «{title}» — <b>{grade}/100</b>\n{feedback}', '<b>{student}</b>: "{title}" — <b>{grade}/100</b>\n{feedback}'],
  'n.test_new': ['Yangi test: <b>{title}</b> ({questions} ta savol). Ilovada yeching!', 'Новый тест: <b>{title}</b> ({questions} вопросов). Решайте в приложении!', 'New quiz: <b>{title}</b> ({questions} questions). Take it in the app!'],
  'n.certificate_issued': ['Tabriklaymiz! <b>{student}</b> «{course}» ({level}) sertifikatini oldi.\nTekshirish: {url}', 'Поздравляем! <b>{student}</b> получил(а) сертификат «{course}» ({level}).\nПроверка: {url}', 'Congratulations! <b>{student}</b> earned the "{course}" ({level}) certificate.\nVerify: {url}'],
};

export const METHOD: Record<string, [string, string, string]> = {
  cash: ['naqd', 'наличные', 'cash'], card: ['karta', 'карта', 'card'], transfer: ['o\'tkazma', 'перевод', 'transfer'], payme: ['Payme', 'Payme', 'Payme'], click: ['Click', 'Click', 'Click'], uzum: ['Uzum', 'Uzum', 'Uzum'],
};

const idx = (l: Locale) => (l === 'ru' ? 1 : l === 'en' ? 2 : 0);

/** Looks up a bot string and fills {placeholders}. Values must already be escaped/formatted. */
export function bt(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const row = BOT[key];
  const s = row ? row[idx(locale)] : key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Renders an outbox notification exactly as the bot sends it. */
export function renderNotification(template: string, params: Record<string, unknown>, locale: Locale): string {
  const money = (v: unknown) => formatMoney(Number(v ?? 0), locale);
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dayMonth(v, locale) : esc(v));
  const p = params;
  switch (template) {
    case 'absent': {
      const n = Number(p.streak ?? 0);
      return bt(locale, 'n.absent', { student: esc(p.student), group: esc(p.group), date: date(p.date), time: esc(p.time), streak: n >= 2 ? bt(locale, 'n.absent_streak', { n }) : '' });
    }
    case 'late':
      return bt(locale, 'n.late', { student: esc(p.student), group: esc(p.group), date: date(p.date), time: esc(p.time) });
    case 'payment_received':
      return bt(locale, 'n.payment_received', { amount: money(p.amount), method: METHOD[String(p.method)]?.[idx(locale)] ?? esc(p.method), receipt: esc(p.receiptNo), balance: money(p.balance) });
    case 'payment_reminder':
      return bt(locale, 'n.payment_reminder', { student: esc(p.student), debt: money(p.debt), overdue: Number(p.overdue) > 0 ? bt(locale, 'n.overdue_part', { x: money(p.overdue) }) : '' });
    case 'homework_new':
      return bt(locale, 'n.homework_new', { title: esc(p.title), group: esc(p.group), due: date(p.due) });
    case 'homework_graded':
      return bt(locale, 'n.homework_graded', { student: esc(p.student), title: esc(p.title), grade: Number(p.grade), feedback: esc(p.feedback) });
    case 'test_new':
      return bt(locale, 'n.test_new', { title: esc(p.title), questions: Number(p.questions) });
    case 'certificate_issued':
      return bt(locale, 'n.certificate_issued', { student: esc(p.student), course: esc(p.course), level: esc(p.level), url: esc(p.url) });
    default:
      return esc(template);
  }
}

export const NOTIFICATION_TEMPLATES = ['absent', 'late', 'payment_received', 'payment_reminder', 'homework_new', 'homework_graded', 'test_new', 'certificate_issued'] as const;
