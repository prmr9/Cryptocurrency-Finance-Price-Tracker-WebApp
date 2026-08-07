# Observability

Backend logs only. Deliberately minimal.

```
Application
    ↓  structured JSON, one object per line, on stdout
/var/log/crypto-tracker/backend.log      (systemd StandardOutput=append:)
    ↓  logrotate: copytruncate, 50M × 5
CloudWatch Agent                          (tails the file, EC2 instance role)
    ↓
CloudWatch Logs                           /crypto-tracker/<env>/backend
    ↓
Logs Insights                             errors · request rate · p99 latency
```

**Not implemented, on purpose:** metrics, `/metrics`, CloudWatch custom metrics,
EMF, X-Ray, tracing, dashboards, alarms, SLOs, error budgets, deploy watch,
incident management, frontend telemetry. Logs Insights answers the operational
questions from fields the access log already carries, so none of that is needed
to run this service.

**No credentials.** There is no token, key, or secret anywhere in this path. The
agent authenticates with the EC2 instance role.

---

## 1. Environments are isolated

| | nonprod | prod |
|---|---|---|
| Log group | `/crypto-tracker/nonprod/backend` | `/crypto-tracker/prod/backend` |
| Retention | 14 days | 30 days |
| Log level | `debug` | `info` |
| IAM role | `crypto-tracker-nonprod-app` | `crypto-tracker-prod-app` |

Each instance role can write **only** to its own environment's log groups
([observability.tf](infra/observability.tf)). A nonprod box cannot write into
prod's logs even if its agent config were wrong — the boundary is IAM, not
configuration correctness.

`logs:CreateLogGroup` is deliberately **not** granted. Terraform owns the groups,
so a typo fails loudly with an authorization error instead of silently creating
an unmanaged, never-expiring log group that bills forever.

---

## 2. Cost

**$0/month** at this service's volume.

- CloudWatch Logs **always-free tier**: 5GB ingest + 5GB storage per month
- At ~700 bytes/line that is roughly **7.6M lines/month**, about 175 req/min sustained
- Beyond that: $0.50/GB ingested
- Logs Insights: $0.005 per GB scanned

Three things that would break that, and what prevents each:

| Risk | Prevented by |
|---|---|
| Retention left at never-expire (the usual surprise bill) | capped at 14d/30d in Terraform |
| `LOG_LEVEL=debug` in prod | prod pinned to `info` in `deploy-backend-ec2.sh` |
| A CloudWatch VPC interface endpoint (~$7.20/mo/AZ) | **not created.** These instances have public IPs and reach CloudWatch through the internet gateway at no charge |

---

## 3. Querying (Logs Insights)

Console → CloudWatch → Logs Insights → select `/crypto-tracker/prod/backend`.

**Request rate and error rate, 5-minute buckets**

```
fields @timestamp
| filter ispresent(`http.status_code`)
| stats count(*) as requests,
        sum(`http.status_code` >= 500) as errors_5xx,
        sum(`http.status_code` >= 400 and `http.status_code` < 500) as errors_4xx
        by bin(5m)
```

**p99 / p95 / p50 latency**

```
fields @timestamp, duration_ms
| filter ispresent(duration_ms)
| stats pct(duration_ms, 50) as p50,
        pct(duration_ms, 95) as p95,
        pct(duration_ms, 99) as p99
        by bin(5m)
```

**Slowest routes**

```
fields @timestamp
| filter ispresent(duration_ms)
| stats count(*) as n, pct(duration_ms, 99) as p99 by `http.route`
| sort p99 desc
```

**Recent errors with full context**

```
fields @timestamp, body, `http.route`, `http.status_code`, request_id, trace_id, release_id
| filter severity in ["error", "fatal"]
| sort @timestamp desc
| limit 50
```

**Everything from one request** — the id is in the `x-request-id` response header,
so a user reporting a failure gives you the exact key:

```
fields @timestamp, severity, body
| filter request_id = "PASTE_ID_HERE"
| sort @timestamp asc
```

**Compare two releases** (every record carries `release_id`):

```
fields @timestamp
| filter ispresent(release_id)
| stats count(*) as requests, sum(`http.status_code` >= 500) as errors by release_id
```

---

## 4. Reading logs on the box

The file is the source of truth locally, and works whether or not the agent does:

```bash
ssh ubuntu@<EC2_HOST>
tail -f /var/log/crypto-tracker/backend.log | jq .
jq 'select(.severity=="error")' /var/log/crypto-tracker/backend.log
systemctl status amazon-cloudwatch-agent
```

---

## 5. Log record shape

Every record is one JSON object. Present on all records:

`timestamp` · `severity` · `body` · `service.name` · `deployment.environment` ·
`release_id` · `git_sha` · `deploy_id` · `host.name`

Present on request records:

`trace_id` · `span_id` · `request_id` · `http.method` · `http.route` ·
`http.status_code` · `duration_ms`

`severity` is one of `debug` `info` `warn` `error` `fatal`.

`http.route` is the route **template** (`/portfolios/:id`), never the raw URL, and
unmatched paths collapse to `__unmatched__`. Nothing bills per distinct value
here, but `stats ... by http.route` is unreadable if every id is its own row.

> `trace_id` and `span_id` are stamped on records, but **no spans are exported** —
> there is no tracing backend. They exist so that log-to-trace correlation works
> if one is ever added, without re-instrumenting.

---

## 6. Two rules for anyone adding to this

**Never use `console.*` in `server/`.** Use the structured logger — `console.log`
is unqueryable and bypasses redaction:

```js
const { logger } = require('./observability');
const log = logger.child({ component: 'auth' });
log.error('login failed', { error: err, user_id: id });
```

**Never put CloudWatch-specific logic in application code.** The app writes JSON
to stdout and knows nothing about where it ends up. That is what makes replacing
CloudWatch a change to the shipper on the box rather than a change to this repo —
and it is enforced by a test in
[observability-wiring.test.js](server/test/observability-wiring.test.js).

### Redaction

`redact.js` scrubs at the emit boundary, by key deny-list *and* value pattern
(JWTs, postgres URLs, AWS keys, bearer tokens, EVM addresses). Call sites cannot
opt out. Request bodies and query strings are **never logged at all** — this
service handles signup and login, so not collecting them is a cheaper guarantee
than scrubbing them.

---

## 7. Local development

```bash
cd server && npm start        # JSON logs on stdout
LOG_LEVEL=debug npm start     # more detail
LOG_SINK=none npm start       # silence logs entirely
```

`LOG_LEVEL` and `LOG_SINK` are the entire runtime configuration surface.

Tests run with `LOG_SINK=none` so log lines never bury the reporter's output;
tests that assert on records install a capturing sink via `setSinksForTest()`.

---

## 8. Connector metadata

[observability/connectors.json](observability/connectors.json) describes where
logs go, per environment, so a human or DevAgent can answer "what is the active
observability backend for prod?" from one file.

**It is metadata only.** Nothing reads it at runtime, deploy time, or build time —
editing it changes no behaviour. To actually change where logs go, edit
[provision-backend.sh](infra/scripts/provision-backend.sh) and
[observability.tf](infra/observability.tf), then update the metadata to match.
A test pins that the deploy and provisioning scripts never parse it, so a
documentation edit can never break a deploy.

Adding a second backend later (Grafana Loki, an OTLP collector) means adding an
entry to `destinations` and changing the shipper on the box. The application's
logging code does not change.
