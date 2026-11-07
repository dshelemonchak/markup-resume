variable "region" {
  description = "The AWS region for everything in this project (ADR-0029)."
  type        = string
  default     = "eu-north-1"
}

variable "github_repository" {
  description = "The GitHub repository whose workflows may deploy, as owner/name."
  type        = string
  default     = "dshelemonchak/markup-resume"
}

variable "deploy_branch" {
  description = "Only workflows running on this branch may assume the deploy role."
  type        = string
  default     = "main"
}
