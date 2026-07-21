# Deployment Runbook

Static React app (Create React App) → nginx on EC2. Two environments:

| Environment | Branch    | Deploys via                     |
|-------------|-----------|---------------------------------|
| nonprod     | `develop` | auto on push                    |
| prod        | `main`    | on push (with approval gate)    |

Infra is provisioned with Terraform (`infra/`); deploys run in GitHub Actions.

---

## One-time setup

### 1. Install prerequisites (local machine)
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

### 2. Create AWS credentials for Terraform
You said you're logged in as the AWS **root user**. Don't use root access keys.
In the AWS Console → IAM → create a user `terraform-admin` with programmatic
access and the `AdministratorAccess` policy (fine for a demo; tighten later).
Then configure the CLI:

```bash
aws configure
# paste the Access Key ID / Secret, set region e.g. us-east-1
```

### 3. Provision the infrastructure

```bash
cd infra
terraform init
terraform apply        # review the plan, type "yes"
```

This creates: 2 EC2 instances (nonprod + prod) with nginx, a security group,
Elastic IPs, and an SSH key pair.

Grab the outputs:

```bash
terraform output instance_public_ips      # -> { nonprod = "x.x.x.x", prod = "y.y.y.y" }
terraform output -raw ssh_private_key_pem # the SSH private key (keep secret)
```

### 4. Create the GitHub Environments + secrets
In the GitHub repo → **Settings → Environments**, create two environments:
`nonprod` and `prod`. In **each**, add these secrets:

| Secret        | Value                                                    |
|---------------|----------------------------------------------------------|
| `EC2_HOST`    | that environment's IP from `instance_public_ips`         |
| `EC2_SSH_KEY` | full output of `terraform output -raw ssh_private_key_pem` |

For the **prod** environment, also add a protection rule:
**Required reviewers** → add yourself. This makes prod deploys pause for
manual approval.

### 5. Create the `develop` branch (if it doesn't exist)

```bash
git checkout -b develop
git push -u origin develop
```

---

## Day-to-day

- Merge/push to **`develop`** → deploys to nonprod automatically.
- Merge/push to **`main`**  → deploys to prod (waits for your approval).
- Visit the app at `http://<EC2_HOST>/`.

## Tearing it down

```bash
cd infra
terraform destroy
```

## Notes / next steps
- **SSH is open to the world** (`0.0.0.0/0`) by default so the CI runner can
  connect. To lock it down, set `ssh_ingress_cidr` and instead deploy through a
  bastion or GitHub's IP ranges.
- No HTTPS yet. Add a domain + Let's Encrypt (certbot) or put an ALB/CloudFront
  in front. Ask and I'll wire it up.
- **Backend service (`server/`).** KAN-13 adds an in-VPC HTTP service (`npm start`
  → `node src/index.js`, listens on `PORT`, default `8080`) exposing `GET /health`
  (probes the secret→DB chain) and the auth-session primitives. It needs a JWT
  signing key at boot via `JWT_SECRET` (or `JWT_SECRET_NAME` for Secrets Manager)
  — it refuses to start without one. Front it with the same TLS terminator as
  above (nginx+certbot or an ALB) reverse-proxying to `:8080`; the session
  cookie's `Secure` flag turns on automatically once `NODE_ENV=production` (or
  `COOKIE_SECURE=true`) is set, so it only ships over that HTTPS front.
- Later: swap GitHub Actions for Jenkins — the Terraform and nginx setup stay
  identical; only the CI job that runs `npm run build` + rsync changes.
