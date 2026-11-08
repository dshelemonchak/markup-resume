# cloud-init's first-boot configuration: the files from ./files written in place, then first-boot.sh. Generated with
# yamlencode so no YAML indentation is written by hand.
locals {
  user_data = join("\n", ["#cloud-config", yamlencode({
    write_files = [
      {
        path        = "/etc/markup-resume/server.env"
        permissions = "0644"
        content     = <<-EOT
          AWS_REGION=${var.region}
          REGISTRY=${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com
        EOT
      },
      {
        path        = "/usr/local/lib/markup-resume/first-boot.sh"
        permissions = "0755"
        encoding    = "b64"
        content     = filebase64("${path.module}/files/first-boot.sh")
      },
      {
        path        = "/usr/local/bin/markup-resume-up"
        permissions = "0755"
        encoding    = "b64"
        content     = filebase64("${path.module}/files/markup-resume-up.sh")
      },
      {
        path     = "/etc/systemd/system/markup-resume.service"
        encoding = "b64"
        content  = filebase64("${path.module}/files/markup-resume.service")
      },
      {
        path     = "/etc/systemd/system/docker.service.d/data-volume.conf"
        encoding = "b64"
        content  = filebase64("${path.module}/files/docker-data-volume.conf")
      },
    ]
    runcmd = [["/usr/local/lib/markup-resume/first-boot.sh"]]
  })])
}
