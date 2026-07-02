# Caule App — Documentacao Completa de Reconstrucao

## 1. Ambiente de Desenvolvimento

### 1.1 JDK (Java Development Kit)
```bash
# Download: Zulu JDK 21
cd /tmp
curl -sL "https://cdn.azul.com/zulu/bin/zulu21.38.21-ca-jdk21.0.5-linux_x64.tar.gz" -o jdk.tar.gz
tar -xzf jdk.tar.gz
rm jdk.tar.gz
export JAVA_HOME=/tmp/zulu21.38.21-ca-jdk21.0.5-linux_x64
$JAVA_HOME/bin/javac -version  # javac 21.0.5
```

### 1.2 Android SDK
```bash
cd /tmp
mkdir -p android-sdk/cmdline-tools
curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-12266719_latest.zip"
unzip -q cmdtools.zip
mv cmdline-tools android-sdk/cmdline-tools/latest 2>/dev/null || (mkdir -p android-sdk/cmdline-tools/latest && mv cmdline-tools/* android-sdk/cmdline-tools/latest/)
rm cmdtools.zip 2>/dev/null
export ANDROID_HOME=/tmp/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
yes | sdkmanager --licenses
sdkmanager "platform-tools" "build-tools;35.0.0" "platforms;android-35"
```

### 1.3 Gradle
```bash
cd /tmp
curl -sL "https://mirrors.cloud.tencent.com/gradle/gradle-8.13-bin.zip" -o gradle.zip
unzip -q gradle.zip
rm gradle.zip
export PATH=/tmp/gradle-8.13/bin:$PATH
gradle -v  # Gradle 8.13
```

### 1.4 Variaveis de ambiente (para build)
```bash
export JAVA_HOME=/tmp/zulu21.38.21-ca-jdk21.0.5-linux_x64
export ANDROID_HOME=/tmp/android-sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/tmp/gradle-8.13/bin:$PATH
```

### 1.5 Build do APK
```bash
cd /mnt/agents/output/app
npm run build                          # Build React
rm -rf android/app/src/main/assets/public/
npx cap sync android                  # Sync Capacitor
cd android
gradle assembleDebug                  # Build APK
# APK: app/build/outputs/apk/debug/app-debug.apk
```

---

## 2. Stack Tecnologico

| Tecnologia | Versao | Uso |
|---|---|---|
| React | 18 | UI |
| TypeScript | 5.x | Tipagem |
| Vite | 7.x | Build tool |
| Tailwind CSS | 3.4 | Estilos |
| shadcn/ui | latest | Componentes base |
| Zustand | 4.x | State management |
| Firebase v9 | modular | Auth, Firestore, Storage |
| Capacitor | 7.x | Mobile wrapper |
| React Router DOM | 6.x | Navegacao (HashRouter) |

---

## 3. Estrutura de Pastas

```
/mnt/agents/output/app/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── EmDesenvolvimento.tsx
│   │   └── Sidebar.tsx
│   ├── hooks/
│   │   ├── usePushNotifications.ts
│   │   └── useFirestoreUser.ts
│   ├── lib/
│   │   └── firebase.ts
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── TarefasPage.tsx
│   │   ├── ConfiguracoesPage.tsx
│   │   ├── ComunicacaoPage.tsx
│   │   ├── EventosPage.tsx
│   │   ├── ConquistasPage.tsx
│   │   ├── ProjetosPage.tsx
│   │   ├── CalendarioPage.tsx
│   │   └── admin/
│   │       └── UsersPage.tsx
│   ├── stores/
│   │   ├── authStore.ts
│   │   └── houseStore.ts
│   ├── utils/
│   │   └── formatters.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── android/
│   └── app/
│       └── src/
│           └── main/
│               ├── AndroidManifest.xml
│               ├── assets/
│               └── res/
│                   └── mipmap-*/
│                       └── ic_launcher.png
├── public/
│   └── assets/
│       ├── logo.png              # Logo transparente (icone app + login + pushes)
│       └── logo_casa_3.png       # Logo casa/comunidade (menu Caule)
├── capacitor.config.ts
├── google-services.json          # Configuracao Firebase Android
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Configuracoes

### 4.1 Firebase (src/lib/firebase.ts)
```typescript
const firebaseConfig = {
  apiKey: "AIzaSyBtv6kvVpVfzN05dHMXiSu15PEE7VwAi0k",
  authDomain: "caule-c064f.firebaseapp.com",
  projectId: "caule-c064f",
  storageBucket: "caule-c064f.firebasestorage.app",
  messagingSenderId: "480280627243",
  appId: "1:480280627243:web:c42590a6f3f15465fc826e",
  measurementId: "G-CDNLS8PXM5"
};
```

### 4.2 Capacitor (capacitor.config.ts)
```typescript
const config: CapacitorConfig = {
  appId: 'com.caule.app',
  appName: 'Caule',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,       // IMPORTANTE: plugin retorna credential
      providers: ['google.com'],
    },
  },
};
```

### 4.3 Vite (vite.config.ts)
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 4.4 Tailwind (tailwind.config.js)
```javascript
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: { 900: '#111827', 800: '#1f2937', 700: '#374151', 600: '#4b5563' },
        emerald: { 400: '#34d399', 500: '#10b981', 600: '#059669' },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

---

## 5. Rotas (App.tsx)

| Rota | Pagina | Protecao |
|---|---|---|
| `/login` | LoginForm | Publica (redirect se logado) |
| `/app` | HomePage | Auth |
| `/tarefas` | TarefasPage | Auth |
| `/eventos` | EventosPage | Auth |
| `/conquistas` | ConquistasPage | Auth |
| `/projetos` | ProjetosPage | Auth |
| `/calendario` | CalendarioPage | Auth |
| `/comunicacao` | ComunicacaoPage | Auth |
| `/configuracoes` | ConfiguracoesPage | Admin only |
| `/admin/users` | UsersPage | Admin only |
| `/admin` | AdminPanel | Admin only |
| `/` | Redirect → `/app` ou `/login` | — |

**HashRouter** (obrigatorio para Capacitor com file:// URLs)

---

## 6. Stores (Zustand + persist)

### 6.1 Auth Store (src/stores/authStore.ts)
```typescript
interface UserData {
  uid: string;
  email: string;
  name: string;
  fullName?: string;
  role: 'admin' | 'morador' | 'hospede';
  isActive: boolean;
  isPresent: boolean;
  phone?: string;
  cpf?: string;
  pixKey?: string;
  photoURL?: string;
  houseId?: string;
}

// Persist localStorage key: 'caule-auth-storage'
// Persist parcial: { user, firebaseUser }
```

### 6.2 House Store (src/stores/houseStore.ts)
```typescript
interface Casa { id, nome, endereco, cidade, estado, cep }
// Persist localStorage key: 'caule-house-storage'
```

---

## 7. Autenticacao — Fluxo Completo

### 7.1 Login Google no Mobile (Capacitor)
```
1. Usuario clica "Entrar com Google"
2. Plugin nativo abre tela de selecao de conta
3. Retorna credential com idToken + accessToken
4. signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
5. Firebase JS SDK autenticado
6. AuthListener detecta → buildUserObject() → busca Firestore
7. AppContent detecta user → navega para /app
```

### 7.2 Login Email/Senha
```
1. signInWithEmailAndPassword(auth, email, password)
2. AuthListener detecta → buildUserObject()
3. Navega para /app
```

### 7.3 Logout
```typescript
// 1. Native signOut (mobile)
if (Capacitor.isNativePlatform()) {
  await FirebaseAuthentication.signOut();
}
// 2. Firebase JS signOut
await auth.signOut();
// 3. Clear store
useAuthStore.getState().logout();
```

### 7.4 Busca de Dados do Firestore (buildUserObject)
```
Busca doc 'users/{uid}' no Firestore
  → role (admin/morador/hospede)
  → photoURL (prioridade sobre Gmail)
  → name, fullName, phone, cpf, pixKey
```

---

## 8. Sidebar — Layout Completo

### 8.1 Estrutura
```
Sidebar (aside)
├── Botão Toggle (logo) — expande/recolhe
├── nav (menu)
│   ├── Copa → Visão Geral (/app)
│   ├── Folhas → Tarefas (/tarefas)
│   ├── Flores → Eventos (/eventos)
│   ├── Frutos → Conquistas (/conquistas)
│   ├── Sementes → Projetos (/projetos)
│   ├── Ramos → Moradores (/admin/users)
│   ├── Ciclo → Calendário (/calendario)
│   ├── Raízes → Comunicação (/comunicacao)
│   └── Caule → Configurações (/configuracoes)
└── Rodapé (perfil do usuário)
    └── Drawer de Perfil (editar dados, foto, logout)
```

### 8.2 Larguras
- Expandido: `w-64` (256px)
- Recolhido: `w-20` (80px)

### 8.3 Ícones SVG

**Cores padrão (Ave do Paraíso):**
- Verde caule: `#10b981`
- Verde médio: `#059669`
- Verde escuro: `#047857`
- Laranja flor: `#f59e0b`
- Azul flor: `#3b82f6`
- Amarelo centro: `#fbbf24`

**Estado visual:**
- Ativo: `bg-emerald-600/20 text-emerald-400`, ícone `opacity-100`
- Inativo: `text-gray-400`, ícone `opacity-40 grayscale`
- Hover: `bg-gray-800 text-white`

### 8.4 Ícones — SVGs Completos

**CopaArvoreIcon:**
- 3 camadas de folhas (verde escuro → médio → claro)
- Caule `#047857` strokeWidth 2.5
- Florzinha Ave do Paraíso no topo (laranja/azul/amarelo)

**FolhaIcon:**
- Duas folhas simétricas em verde
- Caule central

**FlorIcon:**
- 5 pétalas ao redor do centro
- Cores: laranja `#f59e0b`, `#f97316`, `#fb923c`
- Centro: `#fbbf24` + `#fef3c7`
- Caule + 2 folhas

**FrutoIcon:**
- 2 abacates (verde `#65a30d` + `#84cc16`)
- 3 pitangas (vermelho `#dc2626`, `#b91c1c`, `#ef4444`)
- Caule + folha

**SementeIcon:**
- Elipse marrom `#92400e`
- Caule verde + folha

**RamosIcon:**
- Caule central + 2 ramos laterais com folhas

**CicloIcon:**
- 3 círculos concêntricos (verde, verde tracejado, laranja)

**RaizIcon:**
- Caule + raízes espalhadas

**CauleConfigIcon:**
- `<img src="/assets/logo_casa_3.png">`

---

## 9. Ícones do App Android

### 9.1 Geração
```python
# Usar Python PIL
from PIL import Image
src = Image.open('logo_casa_2.png').convert('RGBA')
bg_color = (31, 41, 55, 255)  # gray-800 #1f2937

# Tamanhos Android
mipmap-mdpi:    48x48
mipmap-hdpi:    72x72
mipmap-xhdpi:   96x96
mipmap-xxhdpi:  144x144
mipmap-xxxhdpi: 192x192

# Fundo bg_color + logo ocupando 75-85% do espaço
# Salvar como ic_launcher.png e ic_launcher_round.png
```

### 9.2 Assets
| Asset | Arquivo | Uso |
|---|---|---|
| Logo app | `logo_casa_2.png` → `logo.png` | Login, pushes, topo sidebar |
| Logo Caule | `logo_casa_3.png` | Menu configurações |

### 9.3 Remover adaptive icons
```bash
rm -rf android/app/src/main/res/mipmap-anydpi-v26/
```

---

## 10. Firestore — Regras de Seguranca

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    
    match /users/{userId} {
      allow read, write: if isAuthenticated();
    }
    
    match /casas/{casaId} {
      allow read, write: if isAuthenticated();
    }
    
    match /comodos/{comodoId} {
      allow read, write: if isAuthenticated();
    }
    
    match /tarefas/{tarefaId} {
      allow read, write: if isAuthenticated();
    }
    
    match /mensagens/{msgId} {
      allow read, write: if isAuthenticated();
    }
    
    match /notifications/{notifId} {
      allow read, create: if isAuthenticated();
    }
  }
}
```

---

## 11. Firestore — Índices Necessarios

### 11.1 Índice já criado (mensagens)
| Campo | Ordem |
|---|---|
| `casaId` | Ascending |
| `timestamp` | Ascending |

### 11.2 Índice para notificações
| Campo | Ordem |
|---|---|
| `userId` | Ascending |
| `timestamp` | Descending |

### 11.3 Índice futuro (distribuicoes)
| Campo | Ordem |
|---|---|
| `casaId` | Ascending |
| `semanaId` | Descending |

---

## 12. Push Notifications

### 12.1 Configuracao
- `@capacitor/push-notifications`
- `@capacitor/local-notifications`
- Canal Android obrigatório: `caule-default` (importance: 5 HIGH)
- Canal mensagens: `caule-chat`
- `google-services.json` em `android/app/`

### 12.2 Comportamento
- Coletiva: mostra conteúdo completo
- Individual: apenas campainha "Nova mensagem de {nome}"
- Sistema: notificações de tarefas, ausência, etc.

---

## 13. Páginas — Layout Detalhado

### 13.1 HomePage (/app)
- Cards de resumo da casa
- Lista de moradores
- Sidebar fixo à esquerda

### 13.2 ConfiguracoesPage (/configuracoes)
**Abas:** Casas | Cômodos | Tarefas | Moradores | Notificações
- Scroll horizontal nas abas (overflow-x-auto)
- Tabelas com overflow-x-auto + min-w-[800px]
- Inputs: py-3, min-h-[44px], text-base
- Botões: min-h-[44px]
- Cards: p-4 md:p-6

**Aba Tarefas:**
- Tabela com colunas: Título, Descrição, Tipo, Frequência, Prioridade, Período, Status, Ações
- Botões: Exportar (CSV), Nova Tarefa
- Ordenação por coluna
- Status colorido (badge)

**Aba Cômodos:**
- Grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
- Cards com ícone emoji, nome, descrição
- Botões Editar/Excluir: flex-1 para largura igual

### 13.3 ComunicacaoPage (/comunicacao) — Chat
**Header:**
- Título "Raízes" + emoji 💬
- Filtros: Todos 💬 | Coletivo 🏠 | Pessoal 👤 | Sistema ⚙️

**Área mensagens:**
- Agrupamento por data (separador "12 de jun")
- Avatar + nome + badge tipo
- Mensagens próprias: alinhadas direita, bg emerald-600
- Mensagens outros: alinhadas esquerda, bg gray-800
- Sistema: centralizado, texto cinza

**Input:**
- Select "Para:" (Todos da casa / 👤 {morador})
- Campo texto + botão enviar ➤
- Enter para enviar

### 13.4 Páginas Em Desenvolvimento
Eventos, Conquistas, Projetos, Calendário → usam `<EmDesenvolvimento />`
- Badge pulsante "Em desenvolvimento"
- Emoji, título, subtítulo
- Mensagem "Estamos cultivando esta sessão com carinho!"
- Barra de progresso estilizada

---

## 14. LoginForm — Layout
```
Centrado na tela, bg-gray-900
├── Logo (img /assets/logo.png) — h-32 w-32
├── "Caule" — text-3xl font-bold
├── "Casa Abacateira" — text-gray-400
├── Form:
│   ├── Email input
│   ├── Senha input  
│   ├── Botão "Entrar" (bg-emerald-600)
│   ├── Divisor "ou"
│   └── Botão Google (bg-gray-800 + ícone SVG)
└── Debug logs (visível se erro)
```

**Login Google Mobile:**
```typescript
// skipNativeAuth: true → retorna credential
const result = await FirebaseAuthentication.signInWithGoogle();
const credential = GoogleAuthProvider.credential(
  result.credential.idToken,
  result.credential.accessToken
);
await signInWithCredential(auth, credential);
// AuthListener detecta e navega automaticamente
```

---

## 15. Multi-tenancy (Casa)

- Todas as coleções scoped por `casaId`
- Casa selecionada salva em `houseStore` (localStorage)
- Queries sempre filtram por `where('casaId', '==', casaAtual.id)`

---

## 16. Cores do Tema

| Token | Hex | Uso |
|---|---|---|
| gray-900 | `#111827` | Fundo principal |
| gray-800 | `#1f2937` | Cards, fundo ícone app |
| gray-700 | `#374151` | Bordas |
| emerald-400 | `#34d399` | Destaque ativo |
| emerald-500 | `#10b981` | Primária, caule ícones |
| emerald-600 | `#059669` | Botões, hover |
| red-400 | `#f87171` | Erros |
| amber-400 | `#fbbf24` | Alertas, centro flor |

---

## 17. Proxima Funcionalidade: Folhas (Tarefas Semanais)

### Semana
- **Segunda → Domingo** (7 dias)
- Geração: domingo às 20:00 (ou ao abrir a página)
- semanaId = YYYY-MM-DD da segunda-feira
- diaSemana: 0=seg, 1=ter, ..., 5=sab, 6=dom

### Coleções Firestore
```
distribuicoes/{semanaId}
  semanaId, casaId, periodo, status, geradaEm
  atribuicoes: [ { tarefaId, titulo, diaSemana, responsavelId, status, ... } ]

execucoes/{execId}
  tarefaId, executorId, distribuicaoId, dataExecucao, timestamp

ausencias/{ausenciaId}
  userId, casaId, tipo ("temporaria"|"periodo"), dataInicio, dataFim, ativa
```

### Interface
- **Calendário** (todos veem tudo): Seg a Dom, com ✅ para concluídas
- **Lista pessoal** (só tarefas do usuário): swipe direita para concluir
- **Botão ausência**: toggle presente/ausente + período com datas
