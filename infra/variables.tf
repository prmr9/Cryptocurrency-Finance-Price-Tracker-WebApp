variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for naming and tagging resources"
  type        = string
  default     = "crypto-tracker"
}

variable "instance_type" {
  description = "EC2 instance type (t3.micro is free-tier eligible in most regions)"
  type        = string
  default     = "t3.micro"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH into the instances. Lock this to your IP, e.g. 1.2.3.4/32. Defaults to open so GitHub Actions runners can connect."
  type        = string
  default     = "0.0.0.0/0"
}

variable "environments" {
  description = "Environments to create instances for"
  type        = list(string)
  default     = ["nonprod", "prod"]
}

# ------------------------------------------------------------------
# Database (RDS PostgreSQL)
# ------------------------------------------------------------------
variable "db_engine_version" {
  description = "PostgreSQL major/minor version. Change if this version isn't offered in your region."
  type        = string
  default     = "16.4"
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is the cheapest (ARM, ~ free-tier eligible)."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB (20 is the practical minimum for gp3)."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial database name created inside the instance."
  type        = string
  default     = "cryptotracker"
}

variable "db_username" {
  description = "Master username for the database."
  type        = string
  default     = "app_admin"
}

variable "db_admin_cidr" {
  description = "Optional extra CIDR allowed to reach Postgres (5432) directly, e.g. your laptop IP 1.2.3.4/32 for running migrations. Leave empty to allow only the app EC2 security group (access DB via SSH tunnel through EC2)."
  type        = string
  default     = ""
}
