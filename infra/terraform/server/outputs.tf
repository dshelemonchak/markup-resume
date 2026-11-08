output "public_ip" {
  description = "The Elastic IP; the A record of the domain at the registrar points here."
  value       = aws_eip.server.public_ip
}

output "instance_id" {
  description = "For a shell: aws ssm start-session --target <instance_id>"
  value       = aws_instance.server.id
}
