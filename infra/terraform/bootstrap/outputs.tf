output "state_bucket" {
  description = "The state bucket; goes into platform/backend.hcl."
  value       = aws_s3_bucket.state.bucket
}

output "region" {
  value = var.region
}
