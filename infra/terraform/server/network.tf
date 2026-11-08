# The account's default VPC: one public server needs no network of its own.
data "aws_vpc" "default" {
  default = true
}

# One fixed availability zone: the data volume lives in a zone, and every instance that mounts it has to be there too.
data "aws_subnet" "server" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "${var.region}a"
  default_for_az    = true
}

# Only Caddy is reachable from outside. No port 22: shell access goes through SSM Session Manager, which the instance
# reaches over outbound HTTPS.
resource "aws_security_group" "server" {
  name        = "markup-resume-server"
  description = "HTTP and HTTPS from anywhere; no SSH"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "server" {
  # 80 for Let's Encrypt and the redirect to https, 443/udp for HTTP/3 (compose.prod.yaml publishes it).
  for_each = {
    http  = { protocol = "tcp", port = 80 }
    https = { protocol = "tcp", port = 443 }
    http3 = { protocol = "udp", port = 443 }
  }

  security_group_id = aws_security_group.server.id
  description       = each.key
  ip_protocol       = each.value.protocol
  from_port         = each.value.port
  to_port           = each.value.port
  cidr_ipv4         = "0.0.0.0/0"
}

# Outbound to anywhere: ECR, SSM, Let's Encrypt, GitHub's OAuth and package updates.
resource "aws_vpc_security_group_egress_rule" "server" {
  security_group_id = aws_security_group.server.id
  description       = "all outbound"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
