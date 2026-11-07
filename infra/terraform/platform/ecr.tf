# The two production images (ADR-0029): the app, and Caddy with the built UI.
locals {
  repositories = toset(["markup-resume-app", "markup-resume-web"])
}

resource "aws_ecr_repository" "images" {
  for_each = local.repositories

  name = each.key
  # Images are tagged with their commit: a tag never moves, so a deploy is exactly the commit it names.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Storage is paid per GB: keep the last 10 images of each, enough to roll back.
resource "aws_ecr_lifecycle_policy" "images" {
  for_each = aws_ecr_repository.images

  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
