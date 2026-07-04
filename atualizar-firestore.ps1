# Atualizar appConfig/version no Firestore
# Executar no PowerShell como Administrador

$ErrorActionPreference = "Stop"

# 1. Ler refresh token do Firebase CLI
$configPath = "$env:USERPROFILE\.config\configstore\firebase-tools.json"
if (-not (Test-Path $configPath)) {
    Write-Host "Arquivo de config do Firebase CLI nao encontrado em: $configPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$refreshToken = $config.tokens.refresh_token

if (-not $refreshToken) {
    Write-Host "Refresh token nao encontrado. Faca login com: firebase login" -ForegroundColor Red
    exit 1
}

Write-Host "Refresh token encontrado. Obtendo novo access token..." -ForegroundColor Cyan

# 2. Obter novo access token via Google OAuth
$body = @{
    refresh_token = $refreshToken
    client_id = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
    client_secret = "j9iMkQiQfO0qoGjfqz0vOr6dBfM"
    grant_type = "refresh_token"
}

try {
    $response = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method POST -Body $body
    $accessToken = $response.access_token
    Write-Host "Access token obtido com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "Erro ao obter access token: $_" -ForegroundColor Red
    Write-Host "Tente fazer login novamente: firebase login" -ForegroundColor Yellow
    exit 1
}

# 3. Atualizar documento no Firestore
$projectId = "caule-c064f"
$documentPath = "projects/$projectId/databases/(default)/documents/appConfig/version"
$firestoreUrl = "https://firestore.googleapis.com/v1/$documentPath" +
    "?updateMask.fieldPaths=latestVersion" +
    "&updateMask.fieldPaths=downloadUrl" +
    "&updateMask.fieldPaths=releaseNotes" +
    "&updateMask.fieldPaths=updatedAt" +
    "&updateMask.fieldPaths=forceUpdate"

$now = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

$documentData = @{
    fields = @{
        latestVersion = @{ stringValue = "1.0.2" }
        downloadUrl = @{ stringValue = "https://github.com/lucas-adasilva/caule/releases/download/v1.0.2/app-debug.apk" }
        releaseNotes = @{ stringValue = "Correcao no login Google - agora funciona via redirect no Android" }
        updatedAt = @{ timestampValue = $now }
        forceUpdate = @{ booleanValue = $false }
    }
} | ConvertTo-Json -Depth 10

try {
    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    }
    
    $result = Invoke-RestMethod -Uri $firestoreUrl -Method PATCH -Headers $headers -Body $documentData
    Write-Host ""
    Write-Host "✅ Documento appConfig/version atualizado com sucesso!" -ForegroundColor Green
    Write-Host "   latestVersion: 1.0.2" -ForegroundColor White
    Write-Host "   downloadUrl: https://github.com/lucas-adasilva/caule/releases/download/v1.0.2/app-debug.apk" -ForegroundColor White
    Write-Host "   releaseNotes: Correcao no login Google - agora funciona via redirect no Android" -ForegroundColor White
} catch {
    Write-Host ""
    Write-Host "❌ Erro ao atualizar Firestore: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternativa: atualize manualmente em:" -ForegroundColor Yellow
    Write-Host "https://console.firebase.google.com/project/caule-c064f/firestore/data/~2FappConfig~2Fversion" -ForegroundColor Cyan
}
