# ==================================================================
# RDS PostgreSQL — one instance per environment (nonprod, prod).
# Credentials are generated here and stored in AWS Secrets Manager so
# the backend / DevAgent / CI read them from one well-known place
# instead of hardcoding anything.
# ==================================================================

# --- Subnets for the DB subnet group (default VPC spans multiple AZs) ---
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "db" {
  name       = "${var.project_name}-db"
  subnet_ids = data.aws_subnets.default.ids

  tags = { Project = var.project_name }
}

# --- Security group for the databases ---
resource "aws_security_group" "db" {
  name        = "${var.project_name}-db"
  description = "Postgres access for the crypto-tracker databases"
  vpc_id      = data.aws_vpc.default.id

  tags = { Project = var.project_name }
}

# Allow the app EC2 instances (their SG) to reach Postgres.
resource "aws_security_group_rule" "db_from_app" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = aws_security_group.web.id
  description              = "Postgres from app EC2 instances"
}

# Optional: allow a specific admin CIDR (e.g. your laptop) for migrations.
resource "aws_security_group_rule" "db_from_admin" {
  count             = var.db_admin_cidr == "" ? 0 : 1
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  security_group_id = aws_security_group.db.id
  cidr_blocks       = [var.db_admin_cidr]
  description       = "Postgres from admin CIDR (migrations)"
}

resource "aws_security_group_rule" "db_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.db.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# --- Per-environment master password (generated, never committed) ---
resource "random_password" "db" {
  for_each = toset(var.environments)

  length  = 24
  special = true
  # Exclude chars RDS rejects in a master password: / @ " and space
  override_special = "!#$%^&*()-_=+[]{}<>:?"
}

# --- The database instances ---
resource "aws_db_instance" "db" {
  for_each = toset(var.environments)

  identifier     = "${var.project_name}-${each.key}"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 2 # storage autoscaling ceiling
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db[each.key].result

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false # single-AZ to keep cost low

  # prod keeps backups + a final snapshot; nonprod is disposable
  backup_retention_period   = each.key == "prod" ? 7 : 1
  skip_final_snapshot       = each.key == "prod" ? false : true
  final_snapshot_identifier = each.key == "prod" ? "${var.project_name}-prod-final" : null
  deletion_protection       = each.key == "prod" ? true : false

  apply_immediately = true

  tags = {
    Project     = var.project_name
    Environment = each.key
  }
}

# --- Store the full connection details in Secrets Manager ---
resource "aws_secretsmanager_secret" "db" {
  for_each = toset(var.environments)

  name        = "${var.project_name}/${each.key}/db"
  description = "Postgres connection details for ${var.project_name} ${each.key}"

  tags = {
    Project     = var.project_name
    Environment = each.key
  }
}

resource "aws_secretsmanager_secret_version" "db" {
  for_each = toset(var.environments)

  secret_id = aws_secretsmanager_secret.db[each.key].id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.db[each.key].address
    port     = aws_db_instance.db[each.key].port
    dbname   = var.db_name
    username = var.db_username
    password = random_password.db[each.key].result
    # Ready-to-use connection string
    url = "postgresql://${var.db_username}:${random_password.db[each.key].result}@${aws_db_instance.db[each.key].address}:${aws_db_instance.db[each.key].port}/${var.db_name}"
  })
}

# --- JWT signing secret, one per environment (KAN-31 backend). Consumed by
# server/src/auth/config.js via JWT_SECRET_NAME -> Secrets Manager -> the
# "secret" field below; the app's IAM role is granted read access in iam.tf. ---
resource "random_password" "jwt" {
  for_each = toset(var.environments)

  length  = 64
  special = true
}

resource "aws_secretsmanager_secret" "jwt" {
  for_each = toset(var.environments)

  name        = "${var.project_name}/${each.key}/jwt"
  description = "JWT signing secret for ${var.project_name} ${each.key}"

  tags = {
    Project     = var.project_name
    Environment = each.key
  }
}

resource "aws_secretsmanager_secret_version" "jwt" {
  for_each = toset(var.environments)

  secret_id = aws_secretsmanager_secret.jwt[each.key].id
  secret_string = jsonencode({
    secret = random_password.jwt[each.key].result
  })
}
