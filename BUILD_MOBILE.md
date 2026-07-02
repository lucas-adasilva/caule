# Build Mobile - Guia Completo

## Android APK (Windows)

### Pré-requisitos
- [Android Studio](https://developer.android.com/studio)
- Node.js (já instalado)

### Passo a passo

```powershell
# 1. Navegue para a pasta do projeto
cd C:\Users\lucas\Downloads\caule-src

# 2. Build web + sync Android
npm run build
node node_modules\@capacitor\cli\bin\capacitor sync android

# 3. Abra no Android Studio
node node_modules\@capacitor\cli\bin\capacitor open android
```

**No Android Studio:**
1. Aguarde o Gradle sincronizar
2. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK em: `android/app/build/outputs/apk/debug/app-debug.apk`

**Para release (Play Store):**
1. Menu: **Build → Generate Signed Bundle / APK**
2. Selecione **APK** → Crie um **keystore**
3. Escolha `release` → **Finish**

---

## iOS IPA (SEM Mac - 3 alternativas)

### ⚠️ Aviso: Apple exige macOS + Xcode para build iOS nativo

---

### Opção 1: GitHub Actions (RECOMENDADO - Gratuito)

Já configuramos o workflow em `.github/workflows/build-ios.yml`.

**Como usar:**
1. Faça push deste arquivo para o GitHub
2. Acesse: [github.com/lucas-adasilva/caule/actions](https://github.com/lucas-adasilva/caule/actions)
3. Clique em **"Build iOS IPA"** → **Run workflow**
4. O GitHub compila em um Mac virtual e gera o .ipa
5. Baixe o artefato no final do workflow

**O que você precisa configurar:**
- Criar uma **Apple Developer Account** ($99/ano) para assinar o app
- Substituir no `exportOptions.plist`:
  - `YOUR_TEAM_ID` → seu Team ID da Apple
  - `YOUR_PROVISIONING_PROFILE_NAME` → nome do provisioning profile

---

### Opção 2: Codemagic (Free Tier)

1. Acesse [codemagic.io](https://codemagic.io)
2. Conecte seu repositório GitHub
3. Selecione o projeto Caule
4. Configure o workflow iOS:

```yaml
workflows:
  ios-build:
    name: Build iOS
    instance_type: mac_mini_m1
    environment:
      groups:
        - apple_credentials
    scripts:
      - npm install
      - npm run build
      - npx cap add ios
      - npx cap sync ios
      - cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -configuration Release archive
    artifacts:
      - ios/App/build/*.ipa
```

5. Adicione suas credenciais Apple nos **Environment Variables**
6. Clique **Start build**

**Vantagem:** Interface web amigável, não precisa entender de CI/CD.

---

### Opção 3: Expo EAS Build (Alternativa)

Se quiser migrar para o Expo (mais fácil para builds):

```bash
# Instale o EAS CLI
npm install -g eas-cli

# Configure o projeto
eas login
eas init

# Build iOS na nuvem
eas build --platform ios
```

**Vantagem:** Não precisa de Apple Developer Account para testes (EAS usa certificados de desenvolvimento próprios).
**Desvantagem:** Requer migração parcial para o ecossistema Expo.

---

## Requisitos para iOS na App Store

| Requisito | Onde obter |
|-----------|------------|
| Apple Developer Account | [developer.apple.com](https://developer.apple.com) - $99/ano |
| App ID (Bundle ID) | `com.caule.app` - registre no Apple Developer Portal |
| Provisioning Profile | Gere no Apple Developer Portal |
| Certificate de distribuição | Gere no Apple Developer Portal |
| Team ID | Veja em Membership Details no Apple Developer |

---

## Arquivos importantes já configurados

| Arquivo | Propósito |
|---------|-----------|
| `.github/workflows/build-ios.yml` | Workflow do GitHub Actions |
| `ios/App/exportOptions.plist` | Configuração de exportação do Xcode |
| `capacitor.config.ts` | Configuração do Capacitor |
| `android/app/build.gradle` | Build do Android |
| `android/app/google-services.json` | Firebase para Android |

---

## Resumo rápido

| Plataforma | Método | Custo | Dificuldade |
|------------|--------|-------|-------------|
| Android APK | Android Studio | Grátis | Fácil |
| iOS IPA | GitHub Actions | Grátis (actions) | Médio |
| iOS IPA | Codemagic | Grátis (500 min/mês) | Fácil |
| iOS IPA | Mac físico | $$$ | Fácil |

**Recomendação:** Use o **GitHub Actions** para iOS e **Android Studio** para Android. Ambos são gratuitos e não precisam de Mac! 🚀
