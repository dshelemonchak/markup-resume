variable "region" {
  description = "The AWS region for everything in this project (ADR-0029)."
  type        = string
  default     = "eu-north-1"
}

variable "domain" {
  description = "The site's domain, without https://; its A record points to the Elastic IP."
  type        = string
  default     = "markup-resume.xyz"
}

variable "instance_type" {
  description = "Graviton (arm64): the images are built for arm64."
  type        = string
  default     = "t4g.small"
}
