import { messages, type Claim } from './contracts';

export const demoClaim: Claim = {
  displayName: 'Maya Chen', title: 'Nova Build Sprint', issuer: 'Nova Studio', date: '2026-11-24',
  location: 'Online', demo: true, tier: 'winner', rank: 1, templateVersion: 1,
  decision: { theme: 'ember', message: messages[0] },
};
