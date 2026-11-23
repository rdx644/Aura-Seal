# Deploy AuraSeal on a runs-on.dev address

AuraSeal needs a Node web service, a separate FFmpeg worker and PostgreSQL. The RunsOn static upload accepts files only. Use a RunsOn CNAME for the canonical HTTPS address of the full application.

1. Claim a name with the GitHub account that will manage the address. If the account already owns a name, use that name or a subdomain permitted by the registry. Use [RunsOn Quickstart](https://runs-on.dev/docs/quickstart).
2. Build the repository Dockerfile from a verified commit. Deploy the image as a web service with its default command and as a worker with `npm run worker`. Give both services access to the same private PostgreSQL database.
3. Set `DATABASE_URL` and the exact `PUBLIC_ORIGIN` on both services. For example, use `https://auraseal.runs-on.dev` if that name belongs to the team. Put `OPENAI_API_KEY` only on the web service. Run `npm run db:migrate` once and provision an organizer as described in the README. Keep the web service health check pointed at `/api/health`.
4. Add the chosen hostname to the application's hosting provider and set the corresponding CNAME in [RunsOn Manage](https://runs-on.dev/manage). Enter the host supplied by the provider. Wait for DNS and provider TLS verification. Render is one compatible Docker host and has a [RunsOn mapping guide](https://runs-on.dev/docs/guides/render).
5. From a separate device, open the public development address and verify it serves AuraSeal. Run the synthetic organizer workflow all the way through download. Scan the exported QR and check the LinkedIn share link against the canonical origin. Record the commit, external URL and smoke evidence under G7.

Use a separate database for each environment. Set the public origin before issuing any certificate because the origin is embedded in its QR, including in downloaded copies. Owner sign-in is required for DNS changes. See [release and recovery](release.md) for backup and rollback.

## Existing Docker host

Copy `deployment.env.example` to `.env.deploy` on the host. Set independent random passwords and leave the example file as a template. Use a hexadecimal application database password so it can be placed in the connection URL. The database initialization script runs only when the named data volume is empty.

Run this from the checked-out repository.

```sh
docker compose --env-file .env.deploy -f compose.deploy.yaml build web
docker compose --env-file .env.deploy -f compose.deploy.yaml up -d --no-build
docker compose --env-file .env.deploy -f compose.deploy.yaml ps -a
curl -fsS http://127.0.0.1:3100/api/health
```

The web port binds to loopback. Connect the host's HTTPS reverse proxy to that port. Configure it to serve the RunsOn hostname and preserve the public Host header. Use the public hostname of the ingress as the RunsOn CNAME and have the ingress issue a certificate for the RunsOn hostname. Use an ingress-preserved client address header only when the proxy overwrites it. The database is reachable on the Compose network only.

Provision the organizer through the private host shell. Set `AURASEAL_ORGANIZER_PASSWORD` in that shell beforehand.

```sh
docker compose --env-file .env.deploy -f compose.deploy.yaml exec -T -e AURASEAL_ORGANIZER_PASSWORD web npm run db:organizer -- organizer "Your organization"
```

Keep a backup of the database volume before changing versions. A successful migration container exits with code 0. The web and worker stay running.
