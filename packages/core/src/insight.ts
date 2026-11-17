/** Attendance statistics, churn risk and the lead funnel. Pure functions over plain rows. */
import type { IsoDate } from './dates';
import { DomainError } from './errors';
import type { Tiyin } from './money';

export const ATTENDANCE = ['present', 'late', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE)[number];

/** Present and late count as attended; excused absences are left out of the rate. */
export function attendanceRate(statuses: readonly AttendanceStatus[]): number | null {
  const counted = statuses.filter((s) => s !== 'excused');
  if (!counted.length) return null;
  return counted.filter((s) => s === 'present' || s === 'late').length / counted.length;
}

/** Unexcused absences in a row, counting back from the most recent lesson. */
export function missedStreak(history: ReadonlyArray<{ date: IsoDate; status: AttendanceStatus }>): number {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  let n = 0;
  for (const h of sorted) {
    if (h.status === 'excused') continue;
    if (h.status !== 'absent') break;
    n++;
  }
  return n;
}

export type RiskReason = 'missed_streak' | 'overdue_debt' | 'low_attendance';
export interface ChurnRisk {
  score: number;
  level: 'none' | 'watch' | 'high';
  reasons: RiskReason[];
}

/**
 * Churn risk: 3+ missed lessons in a row or an overdue unpaid invoice each flag a student; attendance
 * below 60% over the window adds weight. Score 0–100 so the dashboard can sort by it.
 */
export function churnRisk(i: { missedStreak: number; overdueDebt: Tiyin; rate: number | null }): ChurnRisk {
  const reasons: RiskReason[] = [];
  let score = 0;
  if (i.missedStreak >= 3) {
    reasons.push('missed_streak');
    score += Math.min(60, 30 + (i.missedStreak - 3) * 10);
  }
  if (i.overdueDebt > 0) {
    reasons.push('overdue_debt');
    score += 35;
  }
  if (i.rate !== null && i.rate < 0.6) {
    reasons.push('low_attendance');
    score += Math.round((0.6 - i.rate) * 50);
  }
  score = Math.min(100, score);
  const flagged = reasons.includes('missed_streak') || reasons.includes('overdue_debt');
  return { score, level: flagged ? 'high' : score > 0 ? 'watch' : 'none', reasons };
}

// ── Lead funnel ───────────────────────────────────────────────────────────────
export const LEAD_STAGES = ['new', 'placement', 'trial', 'enrolled', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

const NEXT: Record<LeadStage, readonly LeadStage[]> = {
  new: ['placement', 'trial', 'lost'],
  placement: ['trial', 'new', 'lost'],
  trial: ['enrolled', 'placement', 'lost'],
  enrolled: [],
  lost: ['new'],
};

export const canMoveLead = (from: LeadStage, to: LeadStage): boolean => NEXT[from].includes(to);

export function assertLeadMove(from: LeadStage, to: LeadStage): void {
  if (!canMoveLead(from, to)) throw new DomainError('INVALID_TRANSITION', `Lead cannot move from ${from} to ${to}`, { from, to });
}

/** Placement score (0–100) → suggested level. */
export function levelFor(score: number): 'beginner' | 'elementary' | 'pre_intermediate' | 'intermediate' | 'upper_intermediate' {
  if (score < 25) return 'beginner';
  if (score < 45) return 'elementary';
  if (score < 65) return 'pre_intermediate';
  if (score < 85) return 'intermediate';
  return 'upper_intermediate';
}

/**
 * Funnel conversion: how many leads ever reached each stage (a lead in `trial` also passed `new`).
 * Lost leads count for the stages they reached before being lost (`reached`).
 */
export function funnel(leads: ReadonlyArray<{ stage: LeadStage; reached: LeadStage }>): Array<{ stage: LeadStage; count: number; rate: number }> {
  const order: LeadStage[] = ['new', 'placement', 'trial', 'enrolled'];
  const depth = (s: LeadStage) => order.indexOf(s);
  const total = leads.length;
  return order.map((stage) => {
    const count = leads.filter((l) => depth(l.stage === 'lost' ? l.reached : l.stage) >= depth(stage)).length;
    return { stage, count, rate: total ? count / total : 0 };
  });
}
