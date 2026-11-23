# Security and privacy

Organizer accounts have issuer or reviewer privileges. Only issuers can approve, revoke, reissue or retry an export. Sessions expire after eight hours and only opaque token digests are stored. Role checks and PostgreSQL tenant policies protect imports, events, batches and assets. The application trusts the configured origin and can use a single trusted ingress address header for rate limits.

The public verification record reveals approved recipient display name, issuer, event, disclosed rank and dates. Revoked or superseded links expose status only and cannot serve downloads. Files are stored in PostgreSQL and served through capability URLs. Keep verification URLs private unless the recipient wants a public credential. Previously downloaded files can circulate after revocation, so verify against the live record.

CSV and workbook data are size-limited and normalized into private records. Source uploads are processed in memory. The AI provider receives aggregate tier and rank counts. Logs use request and certificate IDs. Audit events are append-only at the application level. Synthetic data is appropriate for demos and release evidence.

Retain issued records for the organizer’s verification policy. Review expired sessions, inactive imports and revoked exports every 30 days. Document the applicable issuer retention interval before accepting real participant data, and apply the same handling to backup rotation. The demo uses original artwork, system fonts and no official logo. Review dependency licenses before selecting a repository license.
