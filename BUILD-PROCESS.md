# Build do APK Android - Caule

## ⚠️ AVISO CRÍTICO

> **NUNCA modifique o `build.gradle` para adicionar código Groovy dinâmico (ex: ler versão de arquivo externo).**
> Isso quebra o build do Android silenciosamente — o APK compila mas o app fica com tela branca.
> O formato do `build.gradle` deve ser mantido exatamente como na v1.0.17.

---

## Pré-requisitos

- Java 21 (Eclipse Adoptium em `C:\Program Files\Eclipse Adoptium\jdk-21.x.x`)
- Node.js instalado (via Kimi runtime ou local)
- Android SDK configurado (variáveis no `variables.gradle`)
- Keystore: `android/app/caule-release.keystore`

---

## Passo a passo (ordem obrigatória)

### 1. Build do web app

```bash
npm run build
```

Isso executa: `tsc -b && vite build && node scripts/fix-capacitor-html.js`

> O script `fix-capacitor-html.js` remove o atributo `crossorigin` de assets locais, necessário para o WebView do Android.

### 2. Sync do Capacitor

```bash
npx cap sync android
```

Copia os assets de `dist/` para `android/app/src/main/assets/public/`.

> **Sempre execute este passo** após `npm run build`, antes de compilar o APK.

### 3. Build do APK (Release)

```bash
cd android
./gradlew clean assembleRelease
```

> **No Git Bash do Windows**, defina `JAVA_HOME` antes:
> ```bash
> export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
> ```

### 4. Copiar o APK gerado

O APK é gerado em:
```
android/app/build/outputs/apk/release/app-release.apk
```

Copie para a raiz do projeto com o nome da versão:
```bash
cp android/app/build/outputs/apk/release/app-release.apk caule-vX.Y.Z.apk
```

### 5. Commit e tag

```bash
git add -A
git commit -m "tipo: descrição (vX.Y.Z)"
git tag -a vX.Y.Z -m "vX.Y.Z - descrição"
git push origin main --tags
```

---

## Formatos do build.gradle (VÁLIDO vs QUEBRADO)

### ✅ FORMATO VÁLIDO (v1.0.17+)

```gradle
defaultConfig {
    applicationId "com.caule.app"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode System.getenv("GITHUB_RUN_NUMBER") ? Integer.parseInt(System.getenv("GITHUB_RUN_NUMBER")) : 1
    versionName System.getenv("VERSION_NAME") ?: "1.0.0"
    testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    aaptOptions {
        ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
    }
}
```

### ❌ FORMATO QUEBRADO (não use!)

Nunca adicione código Groovy para ler arquivos externos no `defaultConfig`:

```gradle
// NÃO FAZER ISSO - quebra o app (tela branca)
def versionFile = file('../../src/version.ts')
def versionString = '1.0.0'
if (versionFile.exists()) { ... }
// etc.
```

---

## Versionamento (SemVer)

A partir de agora, seguimos **Semantic Versioning (MAJOR.MINOR.PATCH)**:

| Tipo | Quando incrementar | Exemplo |
|------|-------------------|---------|
| **MAJOR** (`X.0.0`) | Mudança incompatível que quebra funcionalidades existentes | Refactor de autenticação, mudança de estrutura de dados, remoção de API |
| **MINOR** (`0.X.0`) | Nova funcionalidade adicionada, compatível com versões anteriores | Nova tela, novo recurso, nova integração |
| **PATCH** (`0.0.X`) | Correção de bug ou ajuste sem adicionar/remover funcionalidade | Fix de logout, tela branca, ícone, redirecionamento |

### Versionamento web (`src/version.ts`) vs tag git

- `src/version.ts` = versão do web app (checada pelo `UpdateDialog` para forçar refresh no PWA)
- Tag git (`vX.Y.Z`) = versão do release completo (web + APK nativo)

**Regra**: ambos devem estar sempre sincronizados na mesma versão.

### Como versionar uma nova entrega

1. Decida o tipo de mudança:
   - Bug fix → incrementa **PATCH** (ex: `1.0.19` → `1.0.20`)
   - Nova feature → incrementa **MINOR** (ex: `1.0.19` → `1.1.0`)
   - Breaking change → incrementa **MAJOR** (ex: `1.0.19` → `2.0.0`)

2. Atualize `src/version.ts` com a nova versão

3. Faça commit e tag com a mesma versão:
   ```bash
   git add -A
   git commit -m "tipo: descrição (vX.Y.Z)"
   git tag -a vX.Y.Z -m "vX.Y.Z - descrição"
   ```

### Histórico de versões

| Versão | Data | Tipo | Mudança principal |
|--------|------|------|-------------------|
| v1.0.0 | Jun 2025 | — | Release inicial |
| v1.0.17 | Jul 2025 | PATCH | Fix redirecionamento pós-login + ícones |
| v1.0.18 | Jul 2025 | MINOR | Ícones launcher personalizados + vinculamento contas + login cross-platform |
| v1.0.19 | Jul 2025 | PATCH | Fix build.gradle revertido + logout Firebase + build process documentado |

---

## Checklist antes de gerar APK

- [ ] `npm run build` completo sem erros
- [ ] `npx cap sync android` executado
- [ ] `build.gradle` no formato válido (linhas 10-11 exatas)
- [ ] `src/version.ts` atualizado com a nova versão (SemVer: MAJOR.MINOR.PATCH)
- [ ] Tipo de versão definido (PATCH=bugfix, MINOR=feature, MAJOR=breaking)
- [ ] Ícones do Android gerados corretamente (se mudou o logo)
- [ ] `google-services.json` atualizado (se mudou Firebase config)
- [ ] `./gradlew clean assembleRelease` compila sem erros
- [ ] APK testado em dispositivo real antes de publicar

---

## Troubleshooting

### Tela branca no APK

1. Verifique se `npx cap sync android` foi executado após `npm run build`
2. Verifique se o `build.gradle` não tem código Groovy dinâmico no `defaultConfig`
3. Verifique se o `index.html` em `android/app/src/main/assets/public/` tem os paths corretos
4. Verifique se o `styles.xml` não tem `@drawable/splash` quebrado

### Tela preta no APK

1. Verifique `android/app/src/main/res/values/colors.xml` — deve existir
2. Verifique `android/app/src/main/res/values/styles.xml` — não usar `@drawable/splash` se o arquivo não existir
3. Verifique se o Firebase Analytics não está crashando (getAnalytics try-catch)

### APK não instala ("App not installed")

1. Verifique se o keystore está correto (`caule-release.keystore`)
2. Verifique se o SHA-1 no Firebase Console corresponde ao keystore
3. Desinstale versões anteriores antes de instalar a nova

---

## Arquivos críticos (não modificar sem testar)

| Arquivo | O que acontece se quebrar |
|---------|---------------------------|
| `android/app/build.gradle` | Tela branca / APK não compila |
| `android/app/src/main/res/values/styles.xml` | Tela preta / crash no launch |
| `android/app/src/main/res/values/colors.xml` | Tela preta |
| `android/app/src/main/AndroidManifest.xml` | Permissões / deep links quebram |
| `capacitor.config.ts` | Plugins não funcionam |
| `src/lib/firebase.ts` | App não conecta ao Firebase |
