# Project context for agents (DevAgent / Claude)

Crypto/finance price tracker — a **static Create React App SPA** that fetches
market data from the CoinGecko API. Deployed to AWS EC2 + nginx.

## Key docs — read the relevant one before working

| Topic | Doc | When to read |
|-------|-----|--------------|
| **Database & connections** | [DATABASE.md](DATABASE.md) | Before any code that reads/writes data, adds a table, runs a migration, or needs DB credentials. |
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

## Environments

`develop` → non-prod, `main` → prod (prod deploy is approval-gated). Mirror this
split for any new resource (two isolated copies, nonprod + prod).

## Stack notes

- Frontend: React 17, react-router-dom v6, axios. Static build (`npm run build`).
- A static SPA cannot talk to the DB directly — data access goes through a
  backend API (Lambda+API Gateway or a small service). See DATABASE.md §1.
- IaC: Terraform in `infra/`. CI/CD: GitHub Actions in `.github/workflows/`.
