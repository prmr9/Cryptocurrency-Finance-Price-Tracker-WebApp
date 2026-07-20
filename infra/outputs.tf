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
