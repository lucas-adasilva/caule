# Como Gerar e Distribuir o APK para os Moradores

## Resumo Rapido

Para gerar o arquivo APK (que os moradores instalarao no celular), voce precisa:

1. Instalar o **Java JDK** no seu computador
2. Executar o script `build-apk.sh`
3. Enviar o arquivo gerado para os moradores

---

## Passo 1: Instalar o Java JDK

O Java e necessario para compilar o app Android. Escolha seu sistema operacional:

### Windows

1. Acesse https://adoptium.net
2. Baixe **Eclipse Temurin JDK 21** (versao LTS)
3. Execute o instalador e siga as instrucoes
4. Reinicie o terminal/PC

Verifique no terminal (CMD ou PowerShell):
```
java -version
```
Deve mostrar "openjdk version 21" ou similar.

### Mac

```bash
brew install openjdk@21
```

Ou baixe em https://adoptium.net

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install openjdk-21-jdk
```

Verifique:
```bash
java -version
```

---

## Passo 2: Extrair o Projeto

1. Extraia o arquivo `caule.zip`
2. Abra o terminal (CMD, PowerShell ou Terminal)
3. Entre na pasta do projeto:

```bash
cd caule/app
```

---

## Passo 3: Gerar o APK

Ainda no terminal, dentro da pasta `caule/app`, execute:

### Linux / Mac
```bash
bash build-apk.sh
```

### Windows (Git Bash)
```bash
bash build-apk.sh
```

### Windows (CMD/PowerShell)
```bash
npm run build
npx cap sync android
cd android
gradlew assembleDebug
cd ..
```

---

## Passo 4: Encontrar o APK

Apos o comando acima, o APK estara em:

```
caule/app/dist-apk/caule.apk
```

Ou (caminho original):
```
caule/app/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Passo 5: Enviar para os Moradores

### Opcao A: WhatsApp (mais facil)
1. Abra o grupo dos moradores no WhatsApp
2. Anexe o arquivo `caule.apk`
3. Envie com uma mensagem explicando

### Opcao B: Google Drive
1. Faca upload do `caule.apk` no Google Drive
2. Torne o link publico (qualquer pessoa com o link pode ver)
3. Envie o link pelo WhatsApp

### Opcao C: Firebase App Distribution (mais profissional)
1. Acesse https://console.firebase.google.com
2. Va em **App Distribution** no menu lateral
3. Clique em **Comecar** e envie o APK
4. Adicione os emails dos moradores como testadores
5. Eles recebem um email com link para baixar

---

## Instrucoes para os Moradores (copie e cole no WhatsApp)

```
🏠 *Caule - App da Casa*

Para instalar o app no seu celular:

1. Baixe o arquivo acima
2. Toque para abrir
3. Se aparecer "Fonte desconhecida":
   - Toque em CONFIGURACOES
   - Ative "Permitir desta fonte"
   - Volte e toque em INSTALAR
4. Abra o app e faca login com seu email e senha

🔔 IMPORTANTE: Na primeira vez, aceite a permissao de notificacao para receber avisos de tarefas!

Duvidas? Chama o admin! 😊
```

---

## Atualizando o App

Quando voce fizer mudancas no codigo:

1. Edite os arquivos normalmente
2. Execute novamente: `bash build-apk.sh`
3. Um novo APK sera gerado
4. Envie para os moradores novamente

Eles precisam desinstalar a versao antiga e instalar a nova (a menos que voce configure o Google Play, o que e mais complexo).

---

## Solucao de Problemas

**"java nao encontrado"**
- Java nao esta instalado ou nao esta no PATH
- Instale seguindo o Passo 1 acima

**"gradlew: Permission denied" (Linux/Mac)**
- Execute: `chmod +x android/gradlew`
- Depois tente novamente

**Build demora muito na primeira vez**
- Normal! O Gradle baixa dependencias na primeira execucao
- Pode levar 10-15 minutos
- Nas proximas vezes sera mais rapido

**APK nao instala no celular**
- Verifique se o celular permite instalacao de fontes desconhecidas
- Va em: Configuracoes > Seguranca > Fontes desconhecidas
- Ative a permissao
