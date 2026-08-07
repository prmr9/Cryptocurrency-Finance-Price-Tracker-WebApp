# Project context for agents (DevAgent / Claude)

Crypto/finance price tracker — a **static Create React App SPA** that fetches
market data from the CoinGecko API. Deployed to AWS EC2 + nginx.

## Key docs — read the relevant one before working

| Topic | Doc | When to read |
|-------|-----|--------------|
| **Database & connections** | [DATABASE.md](DATABASE.md) | Before any code that reads/writes data, adds a table, runs a migration, or needs DB credentials. |
| **Logging** | [OBSERVABILITY.md](OBSERVABILITY.md) | Before adding a log line, or when you need to query production behaviour (errors, request rate, latency). |
| Deployment / CI-CD | [DEPLOYMENT.md](DEPLOYMENT.md) | Changing how the app builds/deploys. |
| Ops runbook (infra IDs, envs) | `OPERATIONS.md` (local, gitignored) | Operating live infra. |
| Infrastructure as Code | [`infra/`](infra/) | Any AWS resource change (Terraform). |

## Database — the one rule

Credentials are **never** hardcoded. They live in AWS Secrets Manager:

- non-prod → secret `crypto-tracker/nonprod/db`
- prod → secret `crypto-tracker/prod/db`

The backend selects its DB via the `DB_SECRET_NAME` env var and fetches the
secret at runtime. Full details, retrieval commands, and the migration/tunnel
workflow are in [DATABASE.md](DATABASE.md). Do not put DB passwords in code,
`.env` files that get committed, logs, or PRs.

## Observability — the two rules

Backend logs only, and deliberately minimal: JSON on stdout → `backend.log` →
CloudWatch agent → CloudWatch Logs → Logs Insights. No metrics, tracing,
dashboards, alarms or SLOs — Logs Insights answers those from fields the access
log already carries. No credentials anywhere: the agent uses the EC2 instance role.

1. **Never use `console.*` in `server/`.** Use the structured logger:
   `const log = logger.child({ component: 'auth' })`. `console.log` is
   unqueryable and bypasses redaction.
2. **Never put CloudWatch-specific logic in application code.** The app writes
   JSON to stdout and knows nothing about where it ends up — that is what makes
   the shipper replaceable. Enforced by a test.

Full details, queries and cost in [OBSERVABILITY.md](OBSERVABILITY.md).

## Environments

`develop` → non-prod, `main` → prod (prod deploy is approval-gated). Mirror this
split for any new resource (two isolated copies, nonprod + prod).

## Stack notes

- Frontend: React 17, react-router-dom v6, axios. Static build (`npm run build`).
- A static SPA cannot talk to the DB directly — data access goes through a
  backend API (Lambda+API Gateway or a small service). See DATABASE.md §1.
- IaC: Terraform in `infra/`. CI/CD: GitHub Actions in `.github/workflows/`.
