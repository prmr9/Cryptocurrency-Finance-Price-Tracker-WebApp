# ==================================================================
# Observability: CloudWatch log groups + least-privilege write access.
#
# The whole design is: the backend writes JSON lines to
# /var/log/crypto-tracker/backend.log, the CloudWatch agent tails that file, and
# the logs land here. There are no metrics, no metric filters, no EMF, no
# dashboards and no alarms in this stack — CloudWatch Logs Insights answers
# request rate, error counts and p99 latency directly from the log fields, at no
# extra cost. See OBSERVABILITY.md for the queries.
#
# ISOLATION (CLAUDE.md: "Mirror this split for any new resource"): two isolated
# copies, and each environment's instance role can write ONLY to its own log
# groups. A nonprod box cannot write into prod's logs even if its agent config
# were wrong — the boundary is IAM, not configuration correctness.
#
# COST: inside the AWS always-free tier at this service's volume (5GB ingest and
# 5GB storage per month). Retention is capped below rather than left at "Never
# expire", which is the CloudWatch default and the usual reason a "free" log
# group quietly starts billing.
#
# Deliberately NOT created here: a CloudWatch VPC interface endpoint. It would
# cost roughly $7.20/month per AZ, and buys nothing — these instances have public
# IPs and reach CloudWatch through the internet gateway at no charge.
# ==================================================================

# 14 days in nonprod, 30 in prod: long enough to investigate an incident,
# short enough to stay inside the free storage allowance.
locals {
  log_retention_days = {
    nonprod = 14
    prod    = 30
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  for_each = toset(var.environments)

  # This exact name is what infra/scripts/provision-backend.sh renders into the
  # CloudWatch agent config, and what observability/connectors.json publishes to
  # DevAgent. All three derive it the same way: /crypto-tracker/<env>/backend.
  name              = "/${var.project_name}/${each.key}/backend"
  retention_in_days = local.log_retention_days[each.key]

  tags = {
    Project     = var.project_name
    Environment = each.key
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_log_group" "nginx" {
  for_each = toset(var.environments)

  name              = "/${var.project_name}/${each.key}/nginx"
  retention_in_days = local.log_retention_days[each.key]

  tags = {
    Project     = var.project_name
    Environment = each.key
    ManagedBy   = "terraform"
  }
}

# --- Least-privilege log write for the app instance ---------------
#
# Scoped to this environment's two log groups by ARN. Note the ":*" suffix:
# CreateLogStream and PutLogEvents act on log STREAMS inside the group, not on
# the group itself, so the ARN must cover the streams.
#
# CreateLogGroup is deliberately NOT granted. Terraform owns the groups, and
# withholding it means a typo in the agent config fails loudly with an
# authorization error instead of silently creating an unmanaged, never-expiring
# log group that bills forever.
data "aws_iam_policy_document" "app_logs" {
  for_each = toset(var.environments)

  statement {
    sid    = "WriteOwnLogGroups"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "${aws_cloudwatch_log_group.backend[each.key].arn}:*",
      "${aws_cloudwatch_log_group.nginx[each.key].arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "app_logs" {
  for_each = toset(var.environments)

  name   = "${var.project_name}-${each.key}-logs-write"
  role   = aws_iam_role.app[each.key].id
  policy = data.aws_iam_policy_document.app_logs[each.key].json
}
