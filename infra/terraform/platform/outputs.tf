output "deploy_user" {
  description = "The IAM user the deploy workflow signs in as; its access key is created by hand."
  value       = aws_iam_user.deploy.name
}

output "image_repositories" {
  description = "ECR repository URLs by name."
  value       = { for name, repository in aws_ecr_repository.images : name => repository.repository_url }
}
