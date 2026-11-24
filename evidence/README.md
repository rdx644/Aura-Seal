# AuraSeal gate evidence

The release candidate workflow uploads per-theme screenshots, the 50-certificate report, and the isolated PostgreSQL restore report as `auraseal-quality` evidence. Use the artifact from the exact candidate commit. The separate live agent check captures a provider response ID, plan and tool trace with synthetic inputs. Reviewer, public deployment and submission evidence still require the corresponding approvals and hosted run.

## Previous Linux baseline


The [Linux CI run](https://github.com/rdx644/Aura-Seal/actions/runs/45251625590) passed both jobs for commit `e932118`. It builds the app, runs the integration and Playwright suites, and starts the deployment Compose stack to check migrations, container health and the home page.

| Gate | Observed evidence | Remaining evidence |
|---|---|---|
| G0 | Requirements, traceability, architecture and fictional fixture documented | Registered team checks and owner sign-off |
| G1 | CSV and XLSX unit tests, migrated PostgreSQL, role and tenant isolation checks | Reviewer sign-off |
| G2 | Three themes, sequential motion checks and desktop/mobile browser flow. See [the export sample](G4/sample.mp4). | Reviewer sign-off |
| G3 | Structured API contract, invalid model output and fallback tests. Approval, revoke and supersession passed on PostgreSQL. | Live OpenAI response and reviewer sign-off |
| G4 | H.264 1280 × 720, 24 fps, six seconds, 1,276,272 bytes in the published sample. QR decoded from PNG and a paused MP4 frame. Playwright checked download and canonical LinkedIn sharing. | Hosted download and share smoke |
| G5 | 50 native FFmpeg encodes passed the strict size limit. Duplicate approval reused the batch, and a failed job with an expired lease recovered. | Reviewer sign-off |
| G6 | Typecheck, lint, production build, production dependency audit, desktop and mobile browser tests, and clean Docker startup passed. | Restore rehearsal and reviewer sign-off |
| G7 | Docker and RunsOn configuration documented and Compose smoke passed in CI. | Public ingress, DNS/TLS, demonstration and team submission receipt |

The [CI artifact](https://github.com/rdx644/Aura-Seal/actions/runs/45251625590/artifacts/14855129606) contains browser screenshots, the Playwright report, runtime logs and the native batch report. Samples use fictional participants.
