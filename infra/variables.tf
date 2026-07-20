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
