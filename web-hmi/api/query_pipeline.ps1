$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwNTE2MTYwYi05NzJlLTRlYzMtYTA2ZC1kMjJiOTVhYTJlYjQiLCJpYXQiOjE3NzcxMzMxMTEsImV4cCI6MTc3NzczNzkxMX0.2jKmSimm1yJIeMdt05vGOlytczr_o_kwdE74ewb4cCQ"
$uri = "http://192.168.1.80:3001/v1/devices/bc6157cd-132c-4b42-ae43-b77d2bfc5509/pipeline-settings"
try {
    $res = Invoke-RestMethod -Uri $uri -Method GET -Headers @{Authorization="Bearer $token"}
    $res | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
