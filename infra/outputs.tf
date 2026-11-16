output "address" {
  value = aws_eip.app.public_ip
}

output "http_url" {
  value = "http://${aws_eip.app.public_ip}"
}
