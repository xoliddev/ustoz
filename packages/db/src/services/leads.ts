/** Lead funnel: application → placement test → trial lesson → enrolled (or lost), with conversion stats. */
import { assertLeadMove, DomainError, funnel, levelFor, LEAD_STAGES, normalizePhone, uuidv7, type IsoDate, type LeadStage } from '@ustoz/core';
import type { Sql } from '../client';
import type { Actor, Ctx, Member } from './ctx';
import { enrollStudent } from './groups';

export interface LeadRow {
  id: string;
  fullName: string;
  phone: string;
  courseId: string | null;
  courseName: string | null;
  source: string;
  stage: LeadStage;
  reached: LeadStage;
  placementScore: number | null;
  level: string | null;
  trialGroupId: string | null;
  trialGroupName: string | null;
  trialDate: string | null;
  lostReason: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const SELECT = `select l.id, l.full_name, l.phone, l.course_id, c.name as course_name, l.source, l.stage, l.reached, l.placement_score, l.level,
  l.trial_group_id, g.name as trial_group_name, l.trial_date, l.lost_reason, l.notes, l.created_at, l.updated_at
  from leads l left join courses c on c.id = l.course_id left join groups g on g.id = l.trial_group_id`;

const deeper = (a: LeadStage, b: LeadStage) => (LEAD_STAGES.indexOf(b) > LEAD_STAGES.indexOf(a) && b !== 'lost' ? b : a);

export function leadsService(ctx: Ctx) {
  async function get(tx: Sql, id: string): Promise<LeadRow> {
    const [l] = await tx.query<LeadRow>(`${SELECT} where l.id = $1`, [id]);
    if (!l) throw new DomainError('NOT_FOUND', 'Lead not found');
    return l;
  }

  async function move(tx: Sql, m: Member, l: LeadRow, to: LeadStage, set: Record<string, unknown> = {}) {
    assertLeadMove(l.stage, to);
    const fields = { ...set, stage: to, reached: deeper(l.reached, to), updated_at: ctx.now().toISOString() };
    const keys = Object.keys(fields);
    await tx.query(`update leads set ${keys.map((k, n) => `${k} = $${n + 2}`).join(', ')} where id = $1`, [l.id, ...keys.map((k) => fields[k as keyof typeof fields])]);
    await tx.query('insert into lead_events (centre_id, id, lead_id, from_stage, to_stage, at, by_user) values ($1,$2,$3,$4,$5,$6,$7)', [
      m.centreId, uuidv7(ctx.now().getTime()), l.id, l.stage, to, ctx.now().toISOString(), m.userId,
    ]);
    return get(tx, l.id);
  }

  return {
    async 'leads.list'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'leads.manage', (tx) => tx.query<LeadRow>(`${SELECT} order by l.updated_at desc`));
    },

    async 'leads.stats'(a: Actor, i: { days?: number }) {
      return ctx.as(a, 'leads.manage', async (tx) => {
        const since = new Date(ctx.now().getTime() - (i.days ?? 90) * 86_400_000).toISOString();
        const rows = await tx.query<{ stage: LeadStage; reached: LeadStage; source: string }>('select stage, reached, source from leads where created_at >= $1', [since]);
        const sources = new Map<string, { total: number; enrolled: number }>();
        for (const r of rows) {
          const s = sources.get(r.source) ?? { total: 0, enrolled: 0 };
          s.total++;
          if (r.stage === 'enrolled') s.enrolled++;
          sources.set(r.source, s);
        }
        return {
          total: rows.length,
          lost: rows.filter((r) => r.stage === 'lost').length,
          funnel: funnel(rows),
          sources: [...sources].map(([source, v]) => ({ source, ...v })).sort((x, y) => y.total - x.total),
        };
      });
    },

    async 'leads.create'(a: Actor, i: { fullName: string; phone: string; courseId?: string | null; source: string; notes?: string }) {
      return ctx.as(a, 'leads.manage', async (tx, m) => {
        const phone = normalizePhone(i.phone);
        if (!phone) throw new DomainError('VALIDATION', 'Invalid phone number', { field: 'phone' });
        const id = uuidv7(ctx.now().getTime());
        const now = ctx.now().toISOString();
        await tx.query('insert into leads (centre_id, id, full_name, phone, course_id, source, notes, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [
          m.centreId, id, i.fullName.trim(), phone, i.courseId ?? null, i.source, i.notes ?? '', now,
        ]);
        await tx.query('insert into lead_events (centre_id, id, lead_id, to_stage, at, by_user) values ($1,$2,$3,$4,$5,$6)', [m.centreId, uuidv7(ctx.now().getTime()), id, 'new', now, m.userId]);
        return get(tx, id);
      });
    },

    async 'leads.move'(a: Actor, i: { leadId: string; to: Exclude<LeadStage, 'enrolled'>; lostReason?: string }) {
      return ctx.as(a, 'leads.manage', async (tx, m) => {
        const l = await get(tx, i.leadId);
        return move(tx, m, l, i.to, i.to === 'lost' ? { lost_reason: i.lostReason ?? '' } : {});
      });
    },

    async 'leads.placement'(a: Actor, i: { leadId: string; score: number }) {
      return ctx.as(a, 'leads.manage', async (tx, m) => {
        const l = await get(tx, i.leadId);
        const level = levelFor(i.score);
        if (l.stage === 'placement') {
          await tx.query('update leads set placement_score = $2, level = $3, updated_at = $4 where id = $1', [l.id, i.score, level, ctx.now().toISOString()]);
          return get(tx, l.id);
        }
        return move(tx, m, l, 'placement', { placement_score: i.score, level });
      });
    },

    async 'leads.trial'(a: Actor, i: { leadId: string; groupId: string; date: IsoDate }) {
      return ctx.as(a, 'leads.manage', async (tx, m) => {
        const l = await get(tx, i.leadId);
        const [g] = await tx.query('select 1 from groups where id = $1 and status = $2', [i.groupId, 'active']);
        if (!g) throw new DomainError('NOT_FOUND', 'Group not found');
        if (l.stage === 'trial') {
          await tx.query('update leads set trial_group_id = $2, trial_date = $3, updated_at = $4 where id = $1', [l.id, i.groupId, i.date, ctx.now().toISOString()]);
          return get(tx, l.id);
        }
        return move(tx, m, l, 'trial', { trial_group_id: i.groupId, trial_date: i.date });
      });
    },

    /** Converts a lead: creates the student (and parent), enrols them in the trial group, bills prorated. */
    async 'leads.enroll'(a: Actor, i: { leadId: string; groupId?: string; parent?: { fullName: string; phone: string } | null }) {
      return ctx.as(a, 'leads.manage', async (tx, m) => {
        const l = await get(tx, i.leadId);
        assertLeadMove(l.stage, 'enrolled');
        const groupId = i.groupId ?? l.trialGroupId;
        if (!groupId) throw new DomainError('VALIDATION', 'Choose a group', { field: 'groupId' });
        const t = ctx.now().getTime();
        const studentId = uuidv7(t);
        await tx.query('insert into students (centre_id, id, full_name, phone, created_at) values ($1,$2,$3,$4,$5)', [m.centreId, studentId, l.fullName, l.phone, ctx.now().toISOString()]);
        if (i.parent) {
          const phone = normalizePhone(i.parent.phone);
          if (!phone) throw new DomainError('VALIDATION', 'Invalid parent phone number', { field: 'parent.phone' });
          const parentId = uuidv7(t + 1);
          await tx.query('insert into parents (centre_id, id, full_name, phone) values ($1,$2,$3,$4)', [m.centreId, parentId, i.parent.fullName, phone]);
          await tx.query('insert into student_parents (centre_id, student_id, parent_id) values ($1,$2,$3)', [m.centreId, studentId, parentId]);
        }
        const enrollment = await enrollStudent(ctx, tx, m, { groupId, studentId, joinedOn: ctx.today() });
        const lead = await move(tx, m, l, 'enrolled', { student_id: studentId });
        return { lead, studentId, groupId, enrollment };
      });
    },
  };
}
