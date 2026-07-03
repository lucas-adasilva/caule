# 🔧 Configuração do Deploy Automático (GitHub Actions → Firebase Hosting)

Este arquivo explica como configurar o deploy automático a cada push para o GitHub.

---

## ✅ O que está configurado

O workflow `.github/workflows/deploy-firebase.yml` faz:
1. **Build** do projeto a cada push na branch `master`
2. **Deploy automático** no Firebase Hosting

---

## 🔐 Passo 1: Gerar a chave de serviço do Firebase

Você precisa de uma **Service Account Key** do Firebase para o GitHub Actions fazer deploy.

### Opção A: Pelo Firebase Console (recomendado)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Selecione o projeto **caule-c064f**
3. Vá em **⚙️ Configurações do projeto** (engrenagem no canto superior esquerdo)
4. Clique em **Contas de serviço**
5. Clique em **Gerar nova chave privada**
6. Baixe o arquivo `.json`

### Opção B: Pelo CLI (se tiver o firebase instalado)

```bash
firebase login
firebase projects:list
# Selecione o projeto caule-c064f
```

---

## 🔐 Passo 2: Adicionar o secret no GitHub

1. Acesse seu repositório: [github.com/lucas-adasilva/caule](https://github.com/lucas-adasilva/caule)
2. Vá em **Settings → Secrets and variables → Actions**
3. Clique em **New repository secret**
4. **Name:** `FIREBASE_SERVICE_ACCOUNT_CAULE_C064F`
5. **Value:** Cole o conteúdo completo do arquivo `.json` baixado
6. Clique em **Add secret**

---

## ✅ Passo 3: Testar o deploy

1. Faça qualquer alteração e push para o `master`:
   ```bash
   git add .
   git commit -m "test: deploy automático"
   git push origin master
   ```
2. Acesse [github.com/lucas-adasilva/caule/actions](https://github.com/lucas-adasilva/caule/actions)
3. Veja o workflow **"Deploy to Firebase Hosting"** em execução
4. Ao final, o app será atualizado em:
   ```
   https://caule-c064f.web.app
   ```

---

## 🔄 Fluxo automático

```
Push para master
      ↓
GitHub Actions roda
      ↓
Build do projeto (npm run build)
      ↓
Deploy no Firebase Hosting
      ↓
App atualizado em https://caule-c064f.web.app
```

---

## ⚠️ Segurança

- **NUNCA** commite o arquivo `.json` da chave de serviço no repositório
- O secret no GitHub é **criptografado** e acessível apenas pelo workflow
- Se a chave vazar, delete-a no Firebase Console e gere uma nova

---

## 🆘 Se o deploy falhar

Verifique o log do workflow em GitHub Actions. Erros comuns:
- `FIREBASE_SERVICE_ACCOUNT_CAULE_C064F` não configurado → configure o secret
- Permissão negada → verifique se a chave tem permissão de **Cloud Functions** e **Firebase Hosting**
- `projectId` incorreto → deve ser `caule-c064f`

---

## 📋 Resumo

| O que | Onde | Como |
|-------|------|------|
| Gerar chave | Firebase Console → Configurações → Contas de serviço | Botão "Gerar nova chave" |
| Configurar secret | GitHub → Settings → Secrets → Actions | Nome: `FIREBASE_SERVICE_ACCOUNT_CAULE_C064F` |
| Verificar deploy | GitHub → Actions | Workflow "Deploy to Firebase Hosting" |
