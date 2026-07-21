output "instance_public_ips" {
  description = "Public (Elastic) IP of each environment's instance. Use these as the EC2_HOST secret in GitHub."
  value       = { for env in var.environments : env => aws_eip.app[env].public_ip }
}

output "ssh_user" {
  description = "SSH user for the Ubuntu AMI"
  value       = "ubuntu"
}

output "ssh_private_key_pem" {
  description = "Private key for SSH. Paste this into the EC2_SSH_KEY GitHub secret. View with: terraform output -raw ssh_private_key_pem"
  value       = tls_private_key.deploy.private_key_pem
  sensitive   = true
}

# --- Database outputs (endpoints + secret references, never passwords) ---
output "db_endpoints" {
  description = "Postgres host:port for each environment."
  value       = { for env in var.environments : env => "${aws_db_instance.db[env].address}:${aws_db_instance.db[env].port}" }
}

output "db_secret_names" {
  description = "Secrets Manager secret names holding full connection details. Retrieve with: aws secretsmanager get-secret-value --secret-id <name>"
  value       = { for env in var.environments : env => aws_secretsmanager_secret.db[env].name }
}

output "db_secret_arns" {
  description = "Secrets Manager ARNs (grant IAM read access to these for the backend/CI)."
  value       = { for env in var.environments : env => aws_secretsmanager_secret.db[env].arn }
}

# --- IAM role attached to each env's EC2 instance (scoped to read that env's DB secret) ---
output "app_iam_role_arns" {
  description = "ARN of the per-environment EC2 instance role. Verify it grants only secretsmanager:GetSecretValue on that env's db secret."
  value       = { for env in var.environments : env => aws_iam_role.app[env].arn }
}
