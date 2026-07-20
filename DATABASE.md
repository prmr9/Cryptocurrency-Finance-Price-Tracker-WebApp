# Database Guide (for DevAgent / SDLC)

> **Read this before writing any code that touches the database.** It defines
> the one correct way to obtain connection details, the security model, and how
> to run migrations. No credentials live in this file or in the app code — they
> live in **AWS Secrets Manager** and are fetched at runtime.

---

## 1. Architecture — how the app reaches the DB

The frontend is a **static React SPA**. A static frontend **must never** connect
to a database directly (any DB credential shipped to the browser is public).
So the data path is always:

```
 Browser (React SPA)  ──HTTPS──▶  Backend API  ──TCP 5432──▶  RDS PostgreSQL
   (no DB creds)                  (reads secret,             (private, in VPC)
                                   holds connection)
```

- **Browser:** calls your backend API only. Never sees DB credentials.
- **Backend API:** the piece that talks to Postgres. It reads the connection
  secret from Secrets Manager at startup (via its IAM role) — it does **not**
  hardcode credentials. *(This backend is not built yet — see §6.)*
- **RDS:** private (`publicly_accessible = false`), reachable only from the app
  EC2 security group or via an SSH tunnel (§5).

---

## 2. Resources (Terraform-managed, `infra/database.tf`)

| Environment | RDS identifier | Secrets Manager secret name |
|-------------|----------------|-----------------------------|
| non-prod    | `crypto-tracker-nonprod` | `crypto-tracker/nonprod/db` |
| prod        | `crypto-tracker-prod`    | `crypto-tracker/prod/db`    |

- Engine: **PostgreSQL 16** · class **db.t4g.micro** · 20 GB gp3, encrypted · single-AZ
- Initial database name: **`cryptotracker`** · master user: **`app_admin`**
- prod: 7-day backups, deletion protection, final snapshot. nonprod: disposable.
- Get live endpoints: `cd infra && terraform output db_endpoints`

---

## 3. The connection secret (source of truth)

Each secret is JSON:

```json
{
  "engine": "postgres",
  "host": "crypto-tracker-nonprod.xxxx.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "cryptotracker",
  "username": "app_admin",
  "password": "••••••",
  "url": "postgresql://app_admin:••••••@<host>:5432/cryptotracker"
}
```

**Retrieve it** (needs AWS creds with `secretsmanager:GetSecretValue` on the ARN):

```bash
# whole secret
aws secretsmanager get-secret-value --secret-id crypto-tracker/nonprod/db \
  --query SecretString --output text

# just the connection URL
aws secretsmanager get-secret-value --secret-id crypto-tracker/nonprod/db \
  --query SecretString --output text | python3 -c 'import sys,json;print(json.load(sys.stdin)["url"])'
```

Swap `nonprod` → `prod` for the production database.

> 🔒 **Rules for DevAgent & humans:** never paste the password/url into code,
> commits, `.env` files that get committed, logs, or docs. Always read it from
> the secret name above at runtime. The secret name is the stable contract —
> the password behind it can rotate without any code change.

---

## 4. Environment convention for the app/backend

The backend selects its database purely by secret name — set **one** env var:

| Env var | non-prod value | prod value |
|---------|----------------|------------|
| `DB_SECRET_NAME` | `crypto-tracker/nonprod/db` | `crypto-tracker/prod/db` |
| `AWS_REGION`     | `us-east-1` | `us-east-1` |

At boot the backend does: read `DB_SECRET_NAME` → fetch secret → connect. That's
the entire wiring. Matches the existing `develop→nonprod, main→prod` pipeline.

---

## 5. Connecting for migrations / admin (SSH tunnel)

The DB is private, so tunnel through an app EC2 box (which is in the allowed SG):

```bash
# 1. Get the SSH key and DB host
cd infra
terraform output -raw ssh_private_key_pem > /tmp/deploy.pem && chmod 600 /tmp/deploy.pem
DB_HOST=$(terraform output -json db_endpoints | python3 -c 'import sys,json;print(json.load(sys.stdin)["nonprod"].split(":")[0])')

# 2. Open a tunnel: localhost:5432 -> DB via the nonprod EC2 (18.209.83.18)
ssh -i /tmp/deploy.pem -N -L 5432:$DB_HOST:5432 ubuntu@18.209.83.18 &

# 3. Now connect locally (password from the secret in §3)
psql "postgresql://app_admin:<password>@localhost:5432/cryptotracker"

# 4. When done
kill %1 ; rm -f /tmp/deploy.pem
```

> Prefer this over exposing the DB publicly. If DevAgent/CI needs *direct*
> access without a tunnel, set the Terraform variable `db_admin_cidr` to the
> caller's IP (`x.x.x.x/32`) and re-apply — this opens 5432 to just that IP.

---

## 6. Not built yet / next steps (for the onboarding feature)

This conversation only provisioned the **database + secrets + access**. Still to do:

- [ ] **Backend API** — Lambda + API Gateway (recommended, serverless) or a small
      Node/Express service on the existing EC2. It owns all DB access and exposes
      REST/GraphQL endpoints to the SPA.
- [ ] **IAM** — give the backend's role `secretsmanager:GetSecretValue` on the
      env's secret ARN (`terraform output db_secret_arns`) and, if on Lambda,
      VPC access to reach the DB subnets.
- [ ] **Schema & migrations** — pick a tool (recommend `node-pg-migrate`,
      Prisma, or Flyway) and store migrations in the repo. Onboarding tables
      (e.g. `users`, `user_profiles`, `portfolios`) go here.
- [ ] **Wire the SPA** — replace any local state with calls to the backend API.

When ready to build the onboarding feature, start a new task referencing this
file so DevAgent uses the secret-name contract in §3–4.

---

## 7. Cost note

2× `db.t4g.micro` single-AZ ≈ **$24–30/mo** total (compute + 20 GB gp3 + backups).
To cut cost: stop the **nonprod** instance when idle, or (later) collapse to one
shared instance with two databases inside it. RDS is the main cost driver in this
stack — DynamoDB would have been near-free, if you ever reconsider.
