# ==================================================================
# Read-only role for DevAgent's observability connector.
#
# DevAgent's aws-cloudwatch connector takes a role ARN and calls
# sts:AssumeRole, rather than storing an access key. That is the whole
# point of this file: DevAgent authenticates with a credential it
# already holds, assumes THIS role, and the resulting session can do
# nothing except read this project's logs.
#
# WHY THIS MATTERS HERE SPECIFICALLY: the credential DevAgent already
# holds (in its Infrastructure connector) belongs to terraform-admin,
# which is in the AdministratorAccess group -- it can delete RDS
# instances and create IAM users. Pointing the observability connector
# at that key directly would give a log viewer the power to destroy the
# account. Assuming this role instead caps the session at log reads, so
# a mistake or a leak in the observability path cannot touch anything
# else.
#
# Read-only by construction: there is no PutLogEvents, no
# CreateLogGroup, no write action of any kind, and nothing outside
# /crypto-tracker/*. If this role's session key leaked, the worst
# outcome is that someone read application logs -- which are already
# redacted at the emit boundary (server/src/observability/redact.js).
#
# COST: $0. IAM roles and policies are free.
# ==================================================================

variable "devagent_principal_arns" {
  description = <<-EOT
    IAM principals allowed to assume the observability reader role — i.e. the
    identity DevAgent authenticates to AWS as. Defaults to the terraform-admin
    user, whose access key DevAgent already holds in its Infrastructure
    connector. If DevAgent runs as a different identity (or from another AWS
    account), put that principal's ARN here instead; a wrong value surfaces as
    "not authorized to perform sts:AssumeRole" when saving the connector.
  EOT
  type        = list(string)
  default     = ["arn:aws:iam::824909356767:user/terraform-admin"]
}

data "aws_iam_policy_document" "devagent_observability_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = var.devagent_principal_arns
    }
  }
}

resource "aws_iam_role" "devagent_observability_reader" {
  name               = "${var.project_name}-devagent-observability-reader"
  description        = "Read-only CloudWatch Logs access for DevAgent's observability connector. Logs only, /crypto-tracker/* only."
  assume_role_policy = data.aws_iam_policy_document.devagent_observability_assume.json

  # An assumed session lasts at most an hour before DevAgent must re-assume.
  # Short-lived by default is the advantage role assumption has over a static
  # key, so there is no reason to raise it.
  max_session_duration = 3600

  tags = {
    Project   = var.project_name
    Purpose   = "devagent-observability-read"
    ManagedBy = "terraform"
  }
}

data "aws_iam_policy_document" "devagent_observability_read" {
  # Resource-scoped: these actions accept a log-group ARN, so they are pinned
  # to this project's groups across BOTH environments. DevAgent needs both to
  # show nonprod and prod separately; the log group names it queries come from
  # observability/connectors.json.
  statement {
    sid    = "ReadProjectLogGroups"
    effect = "Allow"
    actions = [
      "logs:StartQuery",
      "logs:FilterLogEvents",
      "logs:GetLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/${var.project_name}/*",
    ]
  }

  # These actions do NOT support resource-level permissions and AWS requires "*".
  # That is an API constraint, not a shortcut, and it is worth being precise
  # about what it does and does not grant:
  #
  #   logs:DescribeLogGroups  -- the call carries no log group, so a scoped ARN
  #     can never match it. This lets the role LIST log group names across the
  #     account. It does NOT let it read any group's CONTENTS: reading is
  #     governed by the statement above, which is pinned to /crypto-tracker/*.
  #     Names only, and that is the minimum DevAgent needs to resolve the two
  #     groups from observability/connectors.json.
  #
  #   logs:GetQueryResults / StopQuery / DescribeQueries -- a Logs Insights
  #     query id is not addressable by ARN. Results stay confined to this
  #     project's logs anyway, because the query could only have been STARTED
  #     against the groups allowed above.
  #
  #   cloudwatch:Describe*/Get*/List* -- DevAgent's connector probes for alarms
  #     and metrics during its handshake, and a denial there fails the whole
  #     connection rather than degrading. This service publishes NO metrics and
  #     defines NO alarms (see observability/connectors.json -> not_implemented),
  #     so these calls return empty. Granting read on nothing costs nothing and
  #     keeps the connector from erroring on a capability we chose not to build.
  #
  # Every action here is read-only. None can write, delete, or reach any service
  # other than CloudWatch.
  statement {
    sid    = "ReadAccountWideMetadata"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
      "logs:GetQueryResults",
      "logs:StopQuery",
      "logs:DescribeQueries",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:DescribeAlarmHistory",
      "cloudwatch:ListMetrics",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "devagent_observability_read" {
  name   = "${var.project_name}-devagent-observability-read"
  role   = aws_iam_role.devagent_observability_reader.id
  policy = data.aws_iam_policy_document.devagent_observability_read.json
}

data "aws_caller_identity" "current" {}

output "devagent_observability_role_arn" {
  description = "Paste this into DevAgent → Settings → Observability → 'Read-only role ARN (AssumeRole)'."
  value       = aws_iam_role.devagent_observability_reader.arn
}
