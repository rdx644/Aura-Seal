# Deploy AuraSeal with Render and runs-on.dev

Use the [Render Blueprint](../render.yaml) from the release candidate’s GitHub branch. Render runs the application in Singapore. The public HTTPS origin is `https://auraseal.runs-on.dev`.

| Dependency | Configuration | Purpose |
|---|---|---|
| Render web service | Docker, 0.5 CPU / 512 MB, `/api/health` | Next.js, organizer API and public credential pages |
| Render background worker | Same Dockerfile, 1 CPU / 2 GB | Asynchronous H.264/PNG/PDF exports with bundled FFmpeg and fonts |
| Render Postgres | PostgreSQL 17, 256 MB, 5 GB initial storage | Results, sessions, credential records, durable jobs and assets |
| OpenAI project key | `OPENAI_API_KEY` on the web service | Live Responses API planning |
| runs-on.dev claim | `auraseal.runs-on.dev` with a CNAME to the Render web service | Public hostname with TLS issued by Render |

Render injects the private database URL into both services. Each service runs the idempotent, advisory-lock-protected migration before startup. The database blocks public connections. The Render plans have paid compute and storage. Review the estimate on the Blueprint confirmation screen. See [Render pricing](https://render.com/pricing).

## Provision and connect the domain

1. Claim `auraseal.runs-on.dev` with the team’s GitHub account. For a different claimed hostname, update the Blueprint domain and both `PUBLIC_ORIGIN` values before the first deployment. See [runs-on.dev Quickstart](https://runs-on.dev/docs/quickstart).
2. Open [New Render Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/rdx644/Aura-Seal), select the release candidate’s branch, and connect GitHub if prompted. Set `OPENAI_API_KEY` in Render’s secret field. Review the three paid resources and apply the Blueprint.
3. In [runs-on.dev Manage](https://runs-on.dev/manage), point the claimed hostname’s CNAME at the actual `*.onrender.com` web service hostname shown by Render. Verify the domain in Render’s Custom Domains settings and wait for its TLS certificate. Keep the Render hostname available as the DNS target. See [runs-on.dev’s Render guide](https://runs-on.dev/docs/guides/render).
4. Confirm `https://auraseal.runs-on.dev/api/health` returns `{"status":"ok"}`. Run the release checks on the custom origin. The configured origin is embedded in certificates at render time.
5. Provision the organizer in the private Render web shell. Enter a unique password with `read -rs AURASEAL_ORGANIZER_PASSWORD`, then run the commands below. Use a synthetic issuer for gate evidence.

```sh
export AURASEAL_ORGANIZER_PASSWORD
npm run db:organizer -- demo-issuer "Nova Studio"
unset AURASEAL_ORGANIZER_PASSWORD
```

The Blueprint uses manual deployment. Promote the same green Git commit to the web and worker services. See the [release runbook](release.md) for hosted smoke and rollback verification.

## Existing Docker host

The separate [Compose deployment](../compose.deploy.yaml) supports an existing host. Copy `deployment.env.example` to `.env.deploy`, configure independent database passwords and the canonical HTTPS origin, and run:

```sh
docker compose --env-file .env.deploy -f compose.deploy.yaml build web
docker compose --env-file .env.deploy -f compose.deploy.yaml up -d --no-build --wait
curl -fsS http://127.0.0.1:3100/api/health
```

The web port binds to loopback. Route its public HTTPS hostname through the host’s reverse proxy and keep PostgreSQL on the private Compose network.
