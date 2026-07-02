# Caule - Instrucoes de Instalacao Android

## Passo 1: Configurar Firebase Cloud Messaging

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione o projeto "Caule" (ou crie um novo)
3. Va em **Configuracoes do Projeto** (engrenagem no canto superior esquerdo)
4. Na aba **Geral**, role ate **Seus Apps** e clique no icone do Android
5. Verifique se o nome do pacote e: `com.caule.app`
6. Faca o download do arquivo `google-services.json`
7. **Copie o arquivo para:** `android/app/google-services.json`

## Passo 2: Instalar no Android Studio

1. Abra o **Android Studio**
2. Selecione **Open** e escolha a pasta `android/` do projeto
3. Aguarde o Gradle sync (pode demorar alguns minutos na primeira vez)

## Passo 3: Build e Instalar no Celular

1. Conecte seu celular Android via USB
2. Ative **Depuracao USB** nas opcoes de desenvolvedor do celular
3. No Android Studio, clique no botao **Run** (triangulo verde) ou pressione Shift+F10
4. Selecione seu dispositivo quando aparecer a janela
5. Aguarde o build e instalacao (primeira vez pode demorar 5-10 minutos)

## Passo 4: Testar Push Notifications

### No celular:
1. Abra o app "Caule" instalado
2. Faca login normalmente
3. Conceda permissao de notificacao quando solicitado

### No Firebase Console:
1. Va em **Engajamento > Cloud Messaging**
2. Clique em **Enviar sua primeira mensagem** (ou **Nova campanha**)
3. Digite um titulo e texto para a notificacao
4. Em **Publico**, selecione **App** e escolha `com.caule.app`
5. Clique em **Revisar** e depois **Publicar**

A notificacao deve aparecer no celular em poucos segundos!

## Passo 5: Notificacoes Locais (tarefas do dia)

As notificacoes locais funcionam automaticamente no app. Elas sao agendadas para:
- Manha: 8h00 - Tarefas do dia
- Noite: 20h00 - Recados importantes

Para testar imediatamente, va em **Configuracoes > Tarefas** e clique no botao de teste.

## Estrutura do Projeto

```
caule/
├── src/                    # Codigo React (ja configurado)
├── android/               # Projeto Android (ja configurado)
│   └── app/
│       └── google-services.json   # <-- VOCE PRECISA COLOCAR ESTE ARQUIVO
├── capacitor.config.ts    # Configuracao do Capacitor
└── INSTRUCOES.md          # Este arquivo
```

## Comandos Uteis

```bash
# Build web + sync Android
npm run build && npx cap sync android

# Abrir no Android Studio
npx cap open android

# Apenas sync (depois de mudar o codigo)
npx cap sync android
```

## Solucao de Problemas

**Erro: "google-services.json not found"**
- Verifique se o arquivo esta em `android/app/google-services.json`
- O arquivo e baixado do Firebase Console

**Erro: "Permission denied" para notificacoes**
- Va em Configuracoes do Android > Apps > Caule > Notificacoes
- Ative as notificacoes manualmente

**App nao aparece na lista de dispositivos**
- Verifique se a Depuracao USB esta ativada
- Troque o cabo USB
- Execute `adb devices` no terminal para verificar
