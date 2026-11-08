# The latest Amazon Linux 2023 for arm64, as AWS publishes it.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.insecure_value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.server.id
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name

  # cloud-init runs it on the first boot only, so a change takes effect on a new instance; the data volume moves over.
  user_data                   = local.user_data
  user_data_replace_on_change = true

  # IMDSv2 only, and one network hop: the host reaches the metadata service, containers behind Docker's bridge do not,
  # so the app cannot pick up the instance role's credentials.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # The system, Docker images and the swap file. Nothing here has to survive a replacement.
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  # A new AMI is published every few weeks; following it would replace the server on an unrelated apply. The system is
  # updated in place (dnf), or the server replaced on purpose: terraform apply -replace=aws_instance.server
  lifecycle {
    ignore_changes = [ami]
  }

  tags = {
    Name = "markup-resume"
  }
}

# Postgres and Caddy's certificates live here, apart from the root disk, so replacing the instance keeps them.
resource "aws_ebs_volume" "data" {
  availability_zone = data.aws_subnet.server.availability_zone
  type              = "gp3"
  size              = 10
  encrypted         = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "markup-resume-data"
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.server.id

  # On a replacement the old instance is stopped before the volume is taken away, so Postgres shuts down cleanly.
  stop_instance_before_detaching = true
}

# A fixed public address: survives stop, start and replacement; the domain's A record points here.
resource "aws_eip" "server" {
  domain   = "vpc"
  instance = aws_instance.server.id

  tags = {
    Name = "markup-resume"
  }
}
