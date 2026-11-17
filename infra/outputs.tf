output "address" {
  value = aws_eip.app.public_ip
}

output "http_url" {
  value = "http://${aws_eip.app.public_ip}"
}

output "https_url" {
  value = one(aws_apigatewayv2_api.https[*].api_endpoint)
}
