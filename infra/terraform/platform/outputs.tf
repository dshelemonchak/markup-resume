output "deploy_role_arn" {
  description = "For the deploy workflow (aws-actions/configure-aws-credentials, role-to-assume)."
  value       = aws_iam_role.deploy.arn
}

output "image_repositories" {
  description = "ECR repository URLs by name."
  value       = { for name, repository in aws_ecr_repository.images : name => repository.repository_url }
}
