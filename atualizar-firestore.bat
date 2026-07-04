@echo off
chcp 65001 >nul
echo ==========================================
echo  Atualizando appConfig/version no Firestore
echo ==========================================
echo.

powershell -ExecutionPolicy Bypass -Command "& { \
  $configPath = \"$env:USERPROFILE\.config\configstore\firebase-tools.json\"; \
  if (-not (Test-Path $configPath)) { Write-Host 'Config nao encontrado. Execute: firebase login' -ForegroundColor Red; exit 1 } \
  $config = Get-Content $configPath -Raw | ConvertFrom-Json; \
  $refreshToken = $config.tokens.refresh_token; \
  if (-not $refreshToken) { Write-Host 'Token nao encontrado' -ForegroundColor Red; exit 1 } \
  $body = @{ refresh_token = $refreshToken; client_id = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'; client_secret = 'j9iMkQiQfO0qoGjfqz0vOr6dBfM'; grant_type = 'refresh_token' }; \
  $response = Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method POST -Body $body; \
  $accessToken = $response.access_token; \
  $now = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'); \
  $documentData = @{ fields = @{ latestVersion = @{ stringValue = '1.0.2' }; downloadUrl = @{ stringValue = 'https://github.com/lucas-adasilva/caule/releases/download/v1.0.2/app-debug.apk' }; releaseNotes = @{ stringValue = 'Correcao no login Google - agora funciona via redirect no Android' }; updatedAt = @{ timestampValue = $now }; forceUpdate = @{ booleanValue = $false } } } | ConvertTo-Json -Depth 10; \
  $headers = @{ Authorization = \"Bearer $accessToken\"; 'Content-Type' = 'application/json' }; \
  $url = 'https://firestore.googleapis.com/v1/projects/caule-c064f/databases/(default)/documents/appConfig/version?updateMask.fieldPaths=latestVersion&updateMask.fieldPaths=downloadUrl&updateMask.fieldPaths=releaseNotes&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=forceUpdate'; \
  Invoke-RestMethod -Uri $url -Method PATCH -Headers $headers -Body $documentData | Out-Null; \
  Write-Host '' ; \
  Write-Host '✅ appConfig/version atualizado com sucesso!' -ForegroundColor Green; \
  Write-Host '   latestVersion: 1.0.2' -ForegroundColor White; \
  Write-Host '   downloadUrl: atualizado' -ForegroundColor White; \
}"

echo.
echo Pressione qualquer tecla para fechar...
pause >nul
