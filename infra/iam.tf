# ==================================================================
# IAM for the in-VPC backend (KAN-11 / contract C3).
#
# Each environment's EC2 instance gets its OWN role + instance profile,
# scoped to read ONLY that environment's database secret. This is what
# makes the negative acceptance criterion structural rather than asserted:
# an instance whose role is not authorized for a given secret simply
# cannot fetch it, so the backend fails to open the connection and
# surfaces the authorization error -- there is no embedded/fallback path.
#
# Least privilege: a single action (secretsmanager:GetSecretValue) on
# this env's db and jwt secret ARNs only. Never "*", never a managed
# admin policy.
# ==================================================================

# Trust policy: only the EC2 service may assume these roles.
data "aws_iam_policy_document" "app_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# --- Per-environment role assumed by that env's EC2 instance ---
resource "aws_iam_role" "app" {
  for_each = toset(var.environments)

  name               = "${var.project_name}-${each.key}-app"
  assume_role_policy = data.aws_iam_policy_document.app_assume_role.json

  tags = {
    Project     = var.project_name
    Environment = each.key
  }
}

# --- Least-privilege inline policy: read ONLY this env's DB secret ---
data "aws_iam_policy_document" "app_secrets" {
  for_each = toset(var.environments)

  statement {
    sid       = "ReadOwnDbSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db[each.key].arn]
  }

  statement {
    sid       = "ReadOwnJwtSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.jwt[each.key].arn]
  }
}

resource "aws_iam_role_policy" "app_secrets" {
  for_each = toset(var.environments)

  name   = "${var.project_name}-${each.key}-db-secret-read"
  role   = aws_iam_role.app[each.key].id
  policy = data.aws_iam_policy_document.app_secrets[each.key].json
}

# --- Instance profile that attaches the role to the EC2 instance ---
resource "aws_iam_instance_profile" "app" {
  for_each = toset(var.environments)

  name = "${var.project_name}-${each.key}-app"
  role = aws_iam_role.app[each.key].name

  tags = {
    Project     = var.project_name
    Environment = each.key
  }
}
