# Requirements and evidence

| Requirement | Implementation | Test or evidence | Gate |
|---|---|---|---|
| REQ-01 | Responses API with bounded summary and preview tools and schema-checked presentation output | TEST-03–05/13 cover the wire contract, privacy, preview consistency and fallback. Record the live response with the release runbook. | G3 |
| REQ-02 | Validated imports and immutable issued claims | TEST-01/02/08/10 | G2/G5 |
| REQ-03 | Shared six-second motion timeline | TEST-06/07/10 and per-theme browser captures | G2 |
| REQ-04 | Random verification IDs and transactional approval | TEST-08/09 | G3/G5 |
| REQ-05 | Public record status and supersession | TEST-08/10/11 | G3/G6 |
| REQ-06 | Results import and job leases | TEST-02/09 | G5 |
| REQ-07 | Recipient capability downloads | TEST-07/10/11 | G4/G6 |
| REQ-08 | LinkedIn canonical share link | TEST-10 | G4 |
| REQ-09 | Optional trusted rank and ordered reveal | TEST-02/06/07 | G2 |
| REQ-10 | Tier marks, three themes and QR | TEST-07/10 | G2/G3 |
| REQ-11 | Loop continuity and strict byte limit | TEST-06/07/09 | G4/G6 |
| REQ-12 | Orange/green accents and light sample | TEST-10 and preview captures | G2/G6 |
| REQ-13 | Allowed copy and stored approval | TEST-03–05/08/10 | G3 |
| REQ-14 | Session, role, tenant and public-data checks | TEST-08/10/11 | G6 |
| REQ-15 | Atomic jobs, retries and recovery | TEST-09 | G5/G6 |
| REQ-16 | Docker, CI, health and demo script | [Release runbook](release.md). Production smoke pending. | G7 |
| REQ-17 | Brand, rights and submission records | [Requirements](requirements.md). Team and owner confirmation pending. | G7 |

Evidence captures use synthetic data. A test listing identifies the intended check. The [gate report](../evidence/README.md) records which checks actually ran and the remaining sign-offs.
