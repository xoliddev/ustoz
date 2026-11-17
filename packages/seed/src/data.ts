/** Fictional demo centre. Every name below is invented; any resemblance to real people is accidental. */
import type { TelegramUser } from '@ustoz/core';

export const CENTRE = { slug: 'ustoz-academy', name: 'Ustoz Academy' };

export const BRANCHES = [
  { key: 'chilonzor', name: 'Chilonzor', address: 'Chilonzor tumani, Bunyodkor ko\'chasi 12' },
  { key: 'yunusobod', name: 'Yunusobod', address: 'Yunusobod tumani, Amir Temur shoh ko\'chasi 108' },
];

export const ROOMS = [
  { key: 'oxford', branch: 'chilonzor', name: '101 · Oxford', capacity: 14 },
  { key: 'cambridge', branch: 'chilonzor', name: '102 · Cambridge', capacity: 12 },
  { key: 'itlab', branch: 'chilonzor', name: '103 · IT Lab', capacity: 12 },
  { key: 'harvard', branch: 'yunusobod', name: '201 · Harvard', capacity: 16 },
  { key: 'stanford', branch: 'yunusobod', name: '202 · Stanford', capacity: 12 },
  { key: 'pifagor', branch: 'yunusobod', name: '203 · Pifagor', capacity: 14 },
];

export const TEACHERS = [
  { key: 'dilnoza', name: 'Dilnoza Karimova', phone: '+998901110101', subjects: ['English'], color: '#4f46e5', scheme: 'percent', amount: 0, bp: 4000 },
  { key: 'jasur', name: 'Jasur Toshmatov', phone: '+998901110102', subjects: ['IELTS'], color: '#0ea5e9', scheme: 'percent', amount: 0, bp: 4500 },
  { key: 'malika', name: 'Malika Yusupova', phone: '+998901110103', subjects: ['English', 'Kids'], color: '#ec4899', scheme: 'per_student', amount: 12_000_000, bp: 0 },
  { key: 'sardor', name: 'Sardor Rahimov', phone: '+998901110104', subjects: ['Python', 'IT'], color: '#10b981', scheme: 'fixed', amount: 800_000_000, bp: 0 },
  { key: 'nodira', name: 'Nodira Aliyeva', phone: '+998901110105', subjects: ['Matematika'], color: '#f59e0b', scheme: 'per_student', amount: 15_000_000, bp: 0 },
  { key: 'bekzod', name: 'Bekzod Ergashev', phone: '+998901110106', subjects: ['Rus tili'], color: '#ef4444', scheme: 'fixed', amount: 450_000_000, bp: 0 },
  { key: 'aziza', name: 'Aziza Qodirova', phone: '+998901110107', subjects: ['IELTS'], color: '#8b5cf6', scheme: 'percent', amount: 0, bp: 4000 },
  { key: 'timur', name: 'Timur Nazarov', phone: '+998901110108', subjects: ['Frontend', 'IT'], color: '#14b8a6', scheme: 'percent', amount: 0, bp: 3500 },
] as const;

export const COURSES = [
  { key: 'gen-a2', name: 'General English A2', subject: 'English', level: 'A2', fee: 50_000_000, months: 4, color: '#4f46e5' },
  { key: 'pre-ielts', name: 'Pre-IELTS', subject: 'IELTS', level: 'B1', fee: 65_000_000, months: 3, color: '#0ea5e9' },
  { key: 'ielts', name: 'IELTS 6.5+', subject: 'IELTS', level: 'B2', fee: 90_000_000, months: 3, color: '#8b5cf6' },
  { key: 'kids', name: 'Kids English', subject: 'English', level: 'Starter', fee: 45_000_000, months: 6, color: '#ec4899' },
  { key: 'python', name: 'Python Backend', subject: 'IT', level: 'Junior', fee: 80_000_000, months: 6, color: '#10b981' },
  { key: 'react', name: 'Frontend React', subject: 'IT', level: 'Junior', fee: 85_000_000, months: 6, color: '#14b8a6' },
  { key: 'math', name: 'Matematika (DTM)', subject: 'Matematika', level: 'Abituriyent', fee: 55_000_000, months: 9, color: '#f59e0b' },
  { key: 'rus', name: 'Rus tili', subject: 'Rus tili', level: 'A2', fee: 40_000_000, months: 4, color: '#ef4444' },
] as const;

/**
 * Groups: weekday set, times and how many days ago they started (relative to "today", so the demo never
 * ages). The timetable is conflict-free by construction and a test checks it with core.findConflicts.
 */
export const GROUPS = [
  { key: 'a2-1', name: 'A2-14', course: 'gen-a2', teacher: 'dilnoza', room: 'oxford', days: [1, 3, 5], start: '09:00', end: '10:30', startedAgo: 105, size: 11 },
  { key: 'a2-2', name: 'A2-15', course: 'gen-a2', teacher: 'dilnoza', room: 'oxford', days: [1, 3, 5], start: '16:00', end: '17:30', startedAgo: 40, size: 10 },
  { key: 'pre-1', name: 'Pre-IELTS 7', course: 'pre-ielts', teacher: 'jasur', room: 'cambridge', days: [2, 4, 6], start: '10:00', end: '11:30', startedAgo: 62, size: 9 },
  { key: 'ielts-1', name: 'IELTS 6.5 · Morning', course: 'ielts', teacher: 'jasur', room: 'harvard', days: [1, 3, 5], start: '14:00', end: '16:00', startedAgo: 50, size: 12 },
  { key: 'ielts-2', name: 'IELTS 6.5 · Evening', course: 'ielts', teacher: 'aziza', room: 'harvard', days: [2, 4, 6], start: '18:00', end: '20:00', startedAgo: 33, size: 10 },
  { key: 'kids-1', name: 'Kids Stars', course: 'kids', teacher: 'malika', room: 'cambridge', days: [1, 3, 5], start: '14:00', end: '15:00', startedAgo: 140, size: 10 },
  { key: 'kids-2', name: 'Kids Rockets', course: 'kids', teacher: 'malika', room: 'stanford', days: [2, 4, 6], start: '15:00', end: '16:00', startedAgo: 20, size: 8 },
  { key: 'py-1', name: 'Python P-9', course: 'python', teacher: 'sardor', room: 'itlab', days: [2, 4, 6], start: '14:00', end: '16:00', startedAgo: 165, size: 10 },
  { key: 'py-2', name: 'Python P-10', course: 'python', teacher: 'sardor', room: 'itlab', days: [1, 3, 5], start: '18:00', end: '20:00', startedAgo: 12, size: 7 },
  { key: 'react-1', name: 'React F-4', course: 'react', teacher: 'timur', room: 'stanford', days: [1, 3, 5], start: '18:30', end: '20:30', startedAgo: 58, size: 9 },
  { key: 'math-1', name: 'DTM Matematika M-3', course: 'math', teacher: 'nodira', room: 'pifagor', days: [1, 3, 5], start: '08:30', end: '10:00', startedAgo: 120, size: 13 },
  { key: 'math-2', name: 'DTM Matematika M-4', course: 'math', teacher: 'nodira', room: 'pifagor', days: [2, 4, 6], start: '16:00', end: '17:30', startedAgo: 27, size: 11 },
  { key: 'rus-1', name: 'Rus tili R-2', course: 'rus', teacher: 'bekzod', room: 'oxford', days: [2, 4, 6], start: '17:00', end: '18:30', startedAgo: 45, size: 8 },
  { key: 'a2-new', name: 'A2-16 (yangi)', course: 'gen-a2', teacher: 'dilnoza', room: 'cambridge', days: [2, 4, 6], start: '08:00', end: '09:30', startedAgo: -6, size: 4 },
] as const;

export const FIRST_M = ['Aziz', 'Jamshid', 'Sherzod', 'Bobur', 'Otabek', 'Sanjar', 'Ulugbek', 'Doston', 'Islom', 'Javohir', 'Abdulloh', 'Muhammadali', 'Firdavs', 'Behruz', 'Shoxrux', 'Asadbek', 'Diyor', 'Temur', 'Akmal', 'Saidakbar'];
export const FIRST_F = ['Madina', 'Sevara', 'Mohira', 'Zarina', 'Nilufar', 'Shahzoda', 'Gulnoza', 'Dildora', 'Mubina', 'Robiya', 'Kamola', 'Feruza', 'Sabina', 'Laylo', 'Ominaxon', 'Hilola', 'Nozima', 'Muslima', 'Durdona', 'Charos'];
export const LAST = ['Karimov', 'Rashidov', 'Yo\'ldoshev', 'Abdullayev', 'Ismoilov', 'Xolmatov', 'Nazarov', 'Sultonov', 'Mirzayev', 'Raximov', 'Ergashev', 'Tursunov', 'Qosimov', 'Saidov', 'Umarov', 'Jo\'rayev', 'Hamidov', 'Normatov', 'Usmonov', 'Fayzullayev'];

export const LEAD_SOURCES = ['instagram', 'telegram', 'referral', 'google', 'walk_in'] as const;

/** Demo personas: the role switcher signs in as these Telegram users (initData is HMAC-signed in the worker). */
export const PERSONAS: Record<'director' | 'admin' | 'teacher' | 'student' | 'parent', TelegramUser> = {
  director: { id: 700_000_101, first_name: 'Rustam', last_name: 'Aliev', language_code: 'uz' },
  admin: { id: 700_000_102, first_name: 'Gulshan', last_name: 'Mamatova', language_code: 'uz' },
  teacher: { id: 700_000_103, first_name: 'Dilnoza', last_name: 'Karimova', language_code: 'uz' },
  student: { id: 700_000_104, first_name: 'Aziz', last_name: 'Karimov', language_code: 'uz' },
  parent: { id: 700_000_105, first_name: 'Shoira', last_name: 'Karimova', language_code: 'uz' },
};

/** Not a real bot: the demo signs and verifies initData with this placeholder. */
export const DEMO_BOT_TOKEN = '0000000000:DEMO_TOKEN_FOR_THE_BROWSER_DEMO_ONLY';
export const DEMO_CERT_SECRET = 'demo-certificate-signing-key';
