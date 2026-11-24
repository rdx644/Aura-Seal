# Release and recovery

## Runtime

Use a provider that can run two Docker services from the same commit. The web service uses the image command and reads its assigned `PORT`. The worker runs `npm run worker` and needs at least one CPU and enough memory for FFmpeg and font rendering. Run `npm run db:migrate` as a one-off before serving traffic. Provision organizer accounts with `npm run db:organizer` as documented in the README.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Connection to the private PostgreSQL database. Use a non-superuser owner and require TLS for remote connections. |
| `PUBLIC_ORIGIN` | Exact external HTTPS origin shared by web and worker. |
| `OPENAI_API_KEY` | Server-only project key for live agent evidence. |
| `OPENAI_MODEL` | Optional Responses API model override. |
| `TRUST_PROXY_IP_HEADER` | Optional single address header overwritten by trusted ingress. |
| `AURASEAL_FONT_DIR` | Optional worker-local folder with the fonts needed for supported names and scripts. |
| `FFMPEG_PATH` and `FFPROBE_PATH` | Optional binary overrides. |

Protect the database from the public internet. Use an ingress TLS certificate and set `GET /api/health` as the readiness probe. Monitor the oldest queued job and errors logged as `render_job` or `render_queue_retry`. Keep the worker enabled alongside the web service.

## Test and rehearse

Run the database tests against a dedicated migrated database using `AURASEAL_DATABASE_TEST=1 npm run test:db`. Add `AURASEAL_REAL_BULK=1` for the 50-item native render check. The default integration test uses synthetic payloads and tests queue mechanics. For browser tests, install Chromium with `npx playwright install chromium`, start the server and worker, and use the synthetic login defined in the CI workflow or provide its test environment overrides.

Back up PostgreSQL before migration. For a rollback, stop intake on the affected service, pause workers, redeploy the previous commit to web and worker, and leave the shared database intact. Restore a backup into an isolated database for validation. Re-run sign-in, verification, download, issue and render smoke checks before re-enabling traffic. Keep the canonical origin stable across deployments. In Render, pick the previous green Git commit for both services, complete the worker and web redeploys, then repeat the smoke checks. Record both deploy IDs and the verification results.

## Live agent and hosted smoke

Set `OPENAI_API_KEY` through the server environment or a repository secret. Run `npm run --silent test:agent:live` to capture the sanitized plan, provider response ID and tool trace from synthetic rows. After the workflow file reaches the default branch, GitHub Actions can run the same check with the manual `live_agent` input. A deterministic fallback fails that gate.

With the custom domain serving the candidate and a synthetic organizer provisioned, provide the following environment to Playwright and run `npm run test:e2e` from outside Render. Install Chromium with `npx playwright install chromium` first.

| Variable | Setting |
|---|---|
| `PUBLIC_ORIGIN` | `https://auraseal.runs-on.dev` |
| `AURASEAL_TEST_LOGIN` and `AURASEAL_TEST_PASSWORD` | Synthetic organizer credentials |
| `AURASEAL_REQUIRE_LIVE_AGENT` | `1` to require a live proposal |
| `AURASEAL_RECORD_DEMO` | `1` to save the browser recording |

Open the issued URL from a second device, scan the MP4 QR, and record the hosted verification, download and share results. A hosted smoke run writes synthetic credentials to the target database. Use a synthetic issuer throughout.

## Promotion evidence

Record the exact deployment URL and commit, external scan and smoke results, OpenAI response ID, test artifacts and reviewer approvals. The registered team must confirm eligibility and the submission form and save the submission receipt. See the [official event](https://hackindia.org/2026/agentverse-26-supported-by-openai).
