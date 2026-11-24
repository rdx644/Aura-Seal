import './config';
import { planCertificates } from '../lib/agent';
import type { Result } from '../lib/contracts';

const rows: Result[] = [
  { participantRef: 'synthetic-1', displayName: 'Maya Chen', tier: 'winner', rank: 1 },
  { participantRef: 'synthetic-2', displayName: 'Arjun Patel', tier: 'finalist', rank: 4 },
  { participantRef: 'synthetic-3', displayName: 'Elena Rivera', tier: 'participant', rank: null },
];
const result = await planCertificates(rows);
console.log(JSON.stringify(result, null, 2));
if (result.source !== 'openai' || !result.responseId) process.exitCode = 1;
