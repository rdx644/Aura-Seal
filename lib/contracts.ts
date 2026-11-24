import { z } from 'zod';

export const tiers = ['winner', 'finalist', 'participant'] as const;
export const themes = ['ember', 'bloom', 'linen'] as const;
export const messages = ['Congratulations on your achievement.', 'Celebrate what you built.', 'Celebrate your work and creativity.'] as const;
export const labels = { winner: 'Winner', finalist: 'Finalist', participant: 'Participant' };
export type Tier = typeof tiers[number];
export type Theme = typeof themes[number];

const text = (max: number) => z.string().trim().min(1).max(max).refine(
  value => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value), 'Contains unsupported control characters',
);
const date = z.iso.date();
export const eventInput = z.object({
  title: text(100), issuer: text(80), date, location: text(80).optional(),
  demo: z.boolean(), disclose: z.literal(true),
}).strict();
export const resultInput = z.object({
  participantRef: text(80),
  displayName: text(100),
  tier: z.enum(tiers),
  rank: z.number().int().min(1).max(100000).nullable(),
}).refine(row => row.tier === 'winner' ? row.rank === 1 : row.rank !== 1 &&
  (row.tier === 'finalist' || row.rank === null), { message: 'Rank conflicts with the achievement tier' });

export const decisionInput = z.object({ theme: z.enum(themes), message: z.enum(messages) }).strict();
export const planInput = z.object({ winner: decisionInput, finalist: decisionInput, participant: decisionInput }).strict();
export const sessionInput = z.object({ login: z.string().trim().toLowerCase().regex(/^[a-z0-9._@+-]{1,100}$/), password: z.string().min(12).max(128) }).strict();
export const approvalInput = z.object({ approved: z.literal(true) }).strict();
export const reasonInput = z.object({ reason: text(200) }).strict();
export const idInput = z.uuid();
export const publicIdInput = z.string().regex(/^[a-f0-9]{32}$/);
export type Result = z.infer<typeof resultInput>;
export type Decision = z.infer<typeof decisionInput>;
export type Plan = z.infer<typeof planInput>;
export type EventFields = Omit<z.infer<typeof eventInput>, 'disclose'>;
export type Event = EventFields & { id: string };
export type Claim = EventFields & Pick<Result, 'displayName' | 'tier' | 'rank'> & { decision: Decision; templateVersion: 1 };
export type Trace = { step: string; outcome: string }[];
export type Proposal = { source: 'openai' | 'fallback'; responseId?: string; plan: Plan; trace: Trace };
export type ImportError = { row: number; message: string };
export type Import = { id: string; eventId: string; rows: Result[]; errors: ImportError[]; proposal: Proposal | null; batchId: string | null };
export const publicClaim = ({ title, issuer, date, location, demo, displayName, tier, rank, decision, templateVersion }: Claim): Claim =>
  ({ title, issuer, date, location, demo, displayName, tier, rank, decision, templateVersion });
