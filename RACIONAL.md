# Caule App - Racional do Desenvolvimento

## 1. Estrutura Base
- React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Firebase v9 modular (auth, firestore, storage, analytics)
- Zustand + persist (auth store com localStorage)
- Capacitor para Android (skipNativeAuth: true + signInWithCredential)
- HashRouter (necessario para Capacitor com file:// URLs)

## 2. Autenticacao
- Login com email/senha via Firebase JS
- Login Google mobile: @capacitor-firebase/authentication plugin
  - skipNativeAuth: true (plugin retorna credential)
  - signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
  - Isso loga o Firebase JS SDK corretamente
- AuthListener: verifica getCurrentUser() no plugin nativo + onAuthStateChanged
- useFirestoreUser hook: busca doc users/{uid} no Firestore e atualiza role/photo
- Logout: FirebaseAuthentication.signOut() + auth.signOut() + store.logout()

## 3. Multi-tenancy (Casa)
- Todos os dados scoped a uma casa (houseId)
- Colecoes: casas, comodos, tarefas, users
- Casa selecionada salva no houseStore (Zustand)

## 4. Paginas Criadas
- HomePage (/app) - visao geral
- TarefasPage (/tarefas) - lista de tarefas
- ConfiguracoesPage (/configuracoes) - CRUD casas, comodos, tarefas, moradores
- UsersPage (/admin/users) - gestao de usuarios
- EventosPage (/eventos) - em desenvolvimento
- ConquistasPage (/conquistas) - em desenvolvimento
- ProjetosPage (/projetos) - em desenvolvimento
- CalendarioPage (/calendario) - em desenvolvimento
- ComunicacaoPage (/comunicacao) - sera implementada agora

## 5. Componentes
- Sidebar: menu lateral com 9 itens botanicos
  - Icones SVG estilo Ave do Paraiso (cores: verde caule, laranja/azul flor)
  - Toggle expandir/recolher via botao no logo (onClick)
  - Largura: w-64 expandido, w-20 recolhido
  - Icones cinza quando inativo (opacity-40 grayscale), coloridos quando ativo
  - Primeiro icone (topo) sempre colorido (logo oficial)
- LoginForm: email/senha + Google (mobile nativo)
- EmDesenvolvimento: tela placeholder para paginas nao criadas

## 6. Icones Menu (botanicos -> funcionais)
- Copa -> Visao Geral (arvore com flor)
- Folhas -> Tarefas (duas folhas)
- Flores -> Eventos (5 petalas)
- Frutos -> Conquistas (pitangas + abacates)
- Sementes -> Projetos (semente)
- Ramos -> Moradores (ramos)
- Ciclo -> Calendario (circulos concentricos)
- Raizes -> Comunicacao (raizes) - sera chat
- Caule -> Configuracoes (logo casa/comunidade)

## 7. Otimizacoes Mobile
- Inputs: min-h-[44px], py-3, text-base
- Botoes: min-h-[44px]
- Tabelas: overflow-x-auto + min-w-[800px]
- Cards: p-4 md:p-6
- Headers: flex-col sm:flex-row
- Grid comodos: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
- Abas: overflow-x-auto com scroll

## 8. Push Notifications
- skipNativeAuth: true (capacitor.config.ts)
- Canal Android obrigatorio (Android 8+)
- Hook usePushNotifications com createChannel
- Aba Notificacoes em Configuracoes para testar/enviar
- google-services.json configurado no Android

## 9. Firebase Config
- appId: com.caule.app
- skipNativeAuth: true
- providers: google.com
- Regras Firestore: isAuthenticated() permite leitura/escrita para usuarios logados

## 10. Proxima Implementacao: Comunicacao (Raizes)
- Firestore collection: mensagens
- Firestore collection: notifications (historico de push)
- Chat com Firestore real-time listeners
- Push FCM como campainha (notificacao quando app fechado)
- Filtros: coletivo | individual | sistema
- Mensagens coletivas: todos leem e enviam
- Mensagens individuais: texto apenas, push como campainha
- Notificacoes de sistema: na aba Notificacoes do Caule
