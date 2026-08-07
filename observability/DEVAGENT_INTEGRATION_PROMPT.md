# DevAgent observability contract

What this repo actually emits, where it goes, and what is deliberately not built.

Paste the block below into DevAgent (Software Eng mode) to register this service.
It describes the **current baseline only**. It does not prescribe a future
architecture — choosing one is DevAgent's judgement to make, from evidence, when
there is a concrete need. See [Extending](#extending-this-later).

---

```
Register the repo `Cryptocurrency-Finance-Price-Tracker-WebApp` with DevAgent's
observability model.

## Read these first

1. observability/connectors.json — machine-readable: which backend is active per
   environment, log group names, auth method, retention, cost, and an explicit
   `not_implemented` block.
2. OBSERVABILITY.md — the human runbook and the Logs Insights queries.

connectors.json is METADATA ONLY. Nothing reads it at runtime or deploy time.
Editing it changes no behaviour; it describes the pipeline, it does not configure
it. Do not treat it as a control plane.

## The implemented pipeline — this, and nothing else

    Application
        ↓  structured JSON, one object per line, on stdout
    /var/log/crypto-tracker/backend.log       (systemd StandardOutput=append:)
        ↓  logrotate: copytruncate, 50M x 5
    CloudWatch Agent                           (tails the file, EC2 instance role)
        ↓
    CloudWatch Logs                            /crypto-tracker/<env>/backend
        ↓
    Logs Insights                              errors · request rate · p99 latency

Backend logs only. The application writes JSON to stdout and contains NO
CloudWatch-specific code — that is enforced by a test.

## PROD AND NONPROD ARE SEPARATE ENVIRONMENTS

Two isolated copies. Never aggregate them, never query one for the other, and
never present a single combined view without labelling the environment.

    nonprod → /crypto-tracker/nonprod/backend   retention 14d   LOG_LEVEL=debug
    prod    → /crypto-tracker/prod/backend      retention 30d   LOG_LEVEL=info

Each EC2 instance role can write ONLY to its own environment's log groups. The
isolation is enforced by IAM, not by configuration correctness — a misconfigured
nonprod box gets an authorization error, not a cross-write.

## Authentication

EC2 instance role. There is NO token, API key, OTLP credential or secret anywhere
in the observability path. Do not add one, do not ask for one, and do not create
a Secrets Manager entry for telemetry.

## Log record fields

On every record:
  timestamp, severity, body, service.name, deployment.environment,
  release_id, git_sha, deploy_id, host.name

On request records:
  trace_id, span_id, request_id, http.method, http.route, http.status_code,
  duration_ms

severity ∈ {debug, info, warn, error, fatal}
http.route is the route TEMPLATE (/portfolios/:id); unmatched paths are
"__unmatched__".

## How to answer operational questions

There is no metrics system. Derive everything from logs with Logs Insights —
the queries are in OBSERVABILITY.md §3:

  request rate / error rate  → stats count(*), sum(`http.status_code` >= 500) by bin(5m)
  p99 latency                → stats pct(duration_ms, 99) by bin(5m)
  one request end to end     → filter request_id = "..."
  compare two releases       → stats ... by release_id

This is a deliberate design decision, not a gap. The access log already carries
method, route, status and duration, so a separate metrics pipeline would be
redundant and would cost money (CloudWatch bills per custom metric).

## NOT IMPLEMENTED — do not describe these as available

The following do not exist. Do not build views, alerts or automation against
them, and do not report them as degraded or unhealthy — they are ABSENT by
choice, which is different from broken:

  ✗ metrics of any kind — no /metrics endpoint, no CloudWatch custom metrics, no EMF
  ✗ tracing — trace_id/span_id are stamped on log records, but NO spans are
    exported. There is no X-Ray and no trace backend.
  ✗ dashboards — no Grafana, no CloudWatch dashboards
  ✗ alarms or alerting
  ✗ SLOs, error budgets, burn rates
  ✗ deploy watch, bake windows, automated rollback proposals
  ✗ incident management
  ✗ frontend/browser telemetry
  ✗ ADOT or any OpenTelemetry collector

connectors.json carries a `not_implemented` block stating the same thing in
machine-readable form. Treat it as authoritative. If your model of this service
disagrees with it, the file wins — say so rather than silently reconciling.

## What DevAgent should surface

  * The active observability destination per environment, from connectors.json.
  * That backend logs for each environment are reaching their log group.
  * Errors, request rate and p99 latency, computed from Logs Insights, labelled
    per environment.

That is the whole scope today.

## Constraints on any future observability work here

  * `deploy-backend-ec2.sh` is the SINGLE rollback authority (pinned by
    server/test/deploy-correlation.test.js). Never add a second rollback path.
  * Prod deploys stay behind the GitHub Environment approval gate. Propose;
    a human approves.
  * Never use console.* in server/. Use logger.child({ component: '...' }).
  * Never put CloudWatch-specific logic in application code.
  * Redaction happens at the emit boundary (server/src/observability/redact.js).
    Request bodies and query strings are never logged at all.
  * The guiding principle for this repo is minimum cost + minimum complexity +
    useful production logs. Adding a component needs a concrete triggering need,
    not a best-practice argument.
```

---

## Extending this later

The pipeline above is the baseline, not a ceiling. **DevAgent is expected to judge
what — if anything — to add, based on evidence from running the service.** Nothing
here mandates a particular next step.

The one architectural property worth preserving: the application only ever writes
structured JSON to stdout. Every option below is a change to what reads that
stream, so none of them requires touching application logging code.

| If the need is… | A reasonable option | What it costs |
|---|---|---|
| Alerting on error spikes | CloudWatch metric filter + alarm | metric filters create custom metrics: $0.30/metric/month beyond 10 free |
| Dashboards / richer queries | Grafana Cloud free tier, or Loki | free tier; adds an external account and an ingest token |
| Distributed tracing | Span exporter + a trace backend | new application code — this is the only genuinely missing capability |
| Vendor-neutral fan-out to several backends | An OTEL collector on the box | a second daemon on a 1GB t3.micro; only worth it for multiple destinations |

**Before proposing any of these, state the concrete problem it solves and its
monthly cost.** The cost trap worth knowing: publishing this service's log fields
as CloudWatch custom metrics would create roughly 50 metrics *per release*
(`method × route × status_class × release_id`), and `release_id` changes every
deploy — order $150/month. Logs Insights answers the same questions for
approximately nothing, which is why the baseline has no metrics.

To update the baseline: change the pipeline in
[provision-backend.sh](../infra/scripts/provision-backend.sh) and
[observability.tf](../infra/observability.tf), update
[connectors.json](connectors.json) to match, and update this file. The wiring
tests in [observability-wiring.test.js](../server/test/observability-wiring.test.js)
will fail if the metadata and the infrastructure disagree.
