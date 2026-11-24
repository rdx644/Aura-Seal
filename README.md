# AuraSeal

AuraSeal turns approved event results into animated, verifiable achievement certificates. Organizers import CSV or XLSX, review validation and a bounded OpenAI presentation proposal, and explicitly approve issuance. Recipients can verify by QR, download MP4, PNG or PDF, and share the verification URL on LinkedIn.

AuraSeal is an AgentVerse’26 PS-01 project. The bundled Nova Studio data is fictional.

## Run locally

Requirements include Node 24, Docker with Compose, and FFmpeg/FFprobe on PATH. Run these commands from the repository root.

```sh
npm ci --ignore-scripts
docker compose up -d db
cp .env.example .env.local
npm run db:migrate
```

Set `AURASEAL_ORGANIZER_PASSWORD` to a unique password of 12–128 characters in your shell. Provision your organizer and then unset the variable.

```sh
npm run db:organizer -- demo-issuer "Nova Studio"
```

Run `npm run dev` and `npm run worker` in two terminals. Open [the local workspace](http://localhost:3000/), create a fictional demo event and upload [the sample results](public/demo-results.csv). Use the file header `participant_ref,display_name,tier,rank`. Supported tiers are `winner`, `finalist` and `participant`. A winner requires rank 1, finalists may use rank 2 or higher, and participants leave rank blank.

Set `OPENAI_API_KEY` server-side to enable the live agent. Without a usable key, AuraSeal generates a labeled, deterministic presentation proposal. The model only receives counts and selects allowed themes and copy. Public facts come from the approved results.

## Verify the build

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The PostgreSQL and Playwright suites require the runtime described in [release and recovery](docs/release.md). The [traceability matrix](docs/traceability.md) links architecture, tests and gate evidence.

## Deployment

See the [RunsOn deployment guide](docs/runs-on-deployment.md) to serve the full application on a runs-on.dev address.

Deploy the Docker image as a web service and a separate render worker, backed by PostgreSQL. Run migrations and organizer provisioning using the same image. Set the canonical HTTPS origin before issuing a credential so the embedded QR and share URL point to the correct deployment. See [release and recovery](docs/release.md) for variables, health checks and rollback.

See the [architecture](docs/architecture.md), [security and privacy](docs/security-and-privacy.md) and [demo script](docs/demo-script.md). Repository licensing is pending the owner’s choice. Dependency licenses remain with their respective owners.
