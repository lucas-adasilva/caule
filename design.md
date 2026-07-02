# Caule - Design Document

## 1. Overview

**Caule** is a mobile-first web application (compiled to Android APK via Capacitor) for managing shared houses. It handles task distribution among residents, house configuration, user profiles, and gamification through an organic plant-themed interface (tree metaphor: roots, trunk, branches, leaves, flowers, fruits, seeds).

**Primary Language:** Portuguese (Brazil)

### 1.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui components |
| Router | React Router v7 (HashRouter) |
| State | Zustand (with persist middleware) |
| Backend | Firebase (Auth, Firestore, Storage, Functions) |
| Push Notifications | Capacitor Push Notifications |
| Auth Plugin | Capacitor Firebase Authentication |
| Build Tool | Vite 7 |
| Mobile Wrapper | Capacitor 7 |
| Compile SDK | Android 35 (API 35) |
| Min SDK | Android 23 (API 23) |

---

## 2. Design System

### 2.1 Color Palette

The app uses a **dark-first** theme with an organic green (emerald) as the primary accent.

#### Base Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg-primary` | `gray-900` (#111827) | Main app background |
| `bg-card` | `gray-800` (#1F2937) | Cards, panels, sidebar |
| `bg-input` | `gray-800` (#1F2937) | Input fields |
| `border-default` | `gray-700` (#374151) | Card borders, dividers |
| `border-hover` | `emerald-500/50` | Hover state borders |
| `text-primary` | `white` | Headings, primary text |
| `text-secondary` | `gray-400` (#9CA3AF) | Descriptions, labels |
| `text-muted` | `gray-500` (#6B7280) | Hints, disabled text |

#### Accent Colors

| Token | Value | Usage |
|-------|-------|-------|
| `accent-primary` | `emerald-500` (#10B981) | Primary buttons, active states |
| `accent-primary-hover` | `emerald-600` (#059669) | Button hover |
| `accent-primary-bg` | `emerald-600/20` | Active nav background |
| `accent-light` | `emerald-400` (#34D399) | Highlights, badges |

#### Semantic Colors

| Context | Color | Usage |
|---------|-------|-------|
| Success | `green-400` | Online indicators, completed tasks |
| Warning | `yellow-400` | Alerts, pending actions |
| Error | `red-400` | Errors, validation, logout |
| Info | `blue-400` | User count, links |
| Purple | `purple-400` | Event-related |
| Yellow/Gold | `yellow-400` | Achievements, calendar highlights |

### 2.2 Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | `text-4xl` (36px) | bold (700) | `emerald-400` |
| Section heading | `text-2xl` (24px) | bold (700) | white |
| Card title | `text-lg` (18px) | bold (700) | white |
| Body text | `text-base` (16px) | normal (400) | `gray-300` |
| Small text | `text-sm` (14px) | medium (500) | `gray-400` |
| Caption | `text-xs` (12px) | medium (500) | `gray-500` |
| Label | `text-xs` (12px) | medium (500) | `gray-500`, uppercase, tracking-wider |

### 2.3 Spacing Scale

- **Page padding:** `p-6` (24px)
- **Card padding:** `p-5` to `p-6` (20-24px)
- **Card gap:** `gap-4` (16px) for grids, `gap-6` (24px) for sections
- **Section margin:** `mb-8` (32px)
- **Sidebar width (collapsed):** `w-20` (80px)
- **Sidebar width (expanded):** `w-64` (256px)
- **Max content width:** `max-w-6xl` (1152px)

### 2.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-lg` | 8px | Inputs, small buttons |
| `rounded-xl` | 12px | Cards, nav items |
| `rounded-2xl` | 16px | Modal panels |
| `rounded-3xl` | 24px | Large feature cards |
| `rounded-full` | 9999px | Avatars, status dots, badges |

### 2.5 Shadows & Effects

| Effect | Value | Usage |
|--------|-------|-------|
| Backdrop blur | `backdrop-blur-sm` | Modal overlays |
| Overlay bg | `bg-black/60` | Modal backdrops |
| Tooltip shadow | `shadow-xl` | Sidebar tooltips |
| Modal shadow | `shadow-2xl` | Profile drawer |
| Status indicator | `animate-pulse` | Online dots, loading states |
| Spinner | `animate-spin` | Loading indicators |

---

## 3. Layout System

### 3.1 App Shell

```
+-------------------------------------------+
| Sidebar |         Main Content            |
| (80px   |                                 |
|  or     |    Header (house name)          |
|  256px) |                                 |
|         |    Cards Grid                   |
|         |                                 |
|         |    Content Sections             |
|         |                                 |
+---------+---------------------------------+
```

### 3.2 Sidebar

**Behavior:** Collapsible between compact (80px) and expanded (256px) modes.

**Structure:**
- **Header:** Logo image (40x40px) + "Caule" text + house name (when expanded)
- **Navigation:** 9 menu items with SVG icons (56x56px icon area)
- **Footer:** User avatar + name + house name

**Navigation Items:**

| Icon | Poetic | Real | Path | Role |
|------|--------|------|------|------|
| CopaArvore | Copa | Visao Geral | /app | All |
| Folha | Folhas | Tarefas | /tarefas | All |
| Flor | Flores | Eventos | /eventos | All |
| Fruto | Frutos | Conquistas | /conquistas | All |
| Semente | Sementes | Projetos | /projetos | All |
| Ramos | Ramos | Moradores | /admin/users | Admin |
| Ciclo | Ciclo | Calendario | /calendario | All |
| Raiz | Raizes | Comunicacao | /comunicacao | All |
| CauleConfig | Caule | Configuracoes | /configuracoes | Admin |

**Active State:** `bg-emerald-600/20` background + `emerald-400` text + full opacity icon
**Inactive State:** `opacity-40 grayscale` icon + `gray-400` text, hover: `gray-800` bg + white text

---

## 4. Components

### 4.1 Card

```
Background:    gray-800
Border:        1px solid gray-700
Border Radius: rounded-xl (12px)
Padding:       p-5 (20px)
Hover:         border-emerald-500/50 transition-colors
```

**Variants:** Stat Card, Section Card, List Card, Dashed Card (empty states)

### 4.2 Button

| Variant | Background | Text | Hover | Usage |
|---------|-----------|------|-------|-------|
| Primary | `emerald-600` | white | `emerald-500` | Main actions |
| Secondary | `gray-800` | `gray-300` | `gray-700` | Cancel, secondary |
| Danger | `red-500/10` | `red-400` | `red-500/20` | Delete, logout |
| Ghost | transparent | white | `gray-800` | Icon buttons |

**Size:** `py-3 px-4` (48px height). **Disabled:** `opacity-50`

### 4.3 Input Field

```
Background:    gray-800
Border:        1px solid gray-700
Border Radius: rounded-lg
Padding:       px-4 py-3
Focus:         ring-2 ring-emerald-500 outline-none
```

### 4.4 Avatar

| Size | Usage |
|------|-------|
| 32x32px | Sidebar footer, list items |
| 112x112px | Profile drawer photo |

**Image:** `rounded-full` + `object-cover` + `border-gray-600`
**Initials:** `bg-emerald-600` + white text + `rounded-full`

### 4.5 SVG Icons (Custom)

All navigation icons are **custom SVG** components with plant/tree metaphor:
- **CopaArvoreIcon:** Layered tree canopy with Bird of Paradise flower
- **FolhaIcon:** Symmetrical leaf with vein line
- **FlorIcon:** Five-petal flower (Ave do Paraiso style)
- **FrutoIcon:** Avocado with leaves and berries
- **SementeIcon:** Seed/pod with sprout
- **RamosIcon:** Branches with leaves
- **CicloIcon:** Concentric circles (growth rings)
- **RaizIcon:** Roots with main taproot
- **CauleConfigIcon:** Uses `logo_casa_3.png` image

Icon colors: `#10b981`, `#059669`, `#047857`, `#34d399`

---

## 5. Pages

### 5.1 Login (/login)

Centered single-column, full-screen `bg-gray-900`.
- App logo (128x128px), Title "Caule", Subtitle "Casa Abacateira"
- Email + Password inputs, "Entrar" button, Google sign-in
- Error: `bg-red-500/10` + `border-red-500/50` + `text-red-400` banner

### 5.2 Home - Copa (/app)
- Header: House name (`text-4xl`, `emerald-400`)
- Stats Grid (4 columns): Ramos, Folhas, Flores, Frutos
- Resident List: Present residents with avatar + name + role + online indicator
- Bottom Grid: Sementes (projects placeholder) + Ciclo (mini calendar)

### 5.3 Tarefas - Folhas (/tarefas)
- Task distribution algorithm (pool mensal)
- Weekly task view with day columns
- Completion tracking with checkbox
- Redistribution button (preserves completed tasks)
- Priorities: `red-500` (alta), `yellow-500` (media), `green-500` (baixa)

### 5.4 Pages in Development (EmDesenvolvimento)

| Page | Title | Subtitle | Emoji |
|------|-------|----------|-------|
| Eventos | Flores | Eventos da Casa Abacateira | 🌸 |
| Conquistas | Frutos | Conquistas da Casa Abacateira | 🏆 |
| Projetos | Sementes | Projetos da Casa Abacateira | 🌱 |
| Calendario | Ciclo | Calendario da Casa Abacateira | 📅 |
| Comunicacao | Raizes | Comunicacao da Casa Abacateira | 💬 |

**Layout:** Large emoji, `rounded-3xl` card, "Em desenvolvimento" pulse badge, 5-dot progress indicator

### 5.5 Configuracoes - Caule (/configuracoes) - Admin only
House CRUD, Comodos management with emoji suggestions, Tarefas management, User table, Push notifications

### 5.6 Users - Ramos (/admin/users) - Admin only
User table, role editing (admin/morador/hospede), presence toggle, CRUD

---

## 6. User Flows

### 6.1 Authentication
```
[Open App] -> [Check Auth State]
  [Not Logged] -> [Login] -> [Email/Password or Google]
  [Logged] -> [Build User Object] -> [Home Page]
```
- **Native:** `FirebaseAuthentication.addListener('authStateChange')` with `skipNativeAuth: false`
- **Web:** Firebase JS SDK `onAuthStateChanged`

### 6.2 Profile
```
[Click Avatar] -> [Profile Drawer] -> [View/Edit Mode]
  [Edit] -> [Fields: name, fullName, phone, CPF, pixKey]
  [Photo] -> [File Select] -> [Firebase Storage]
  [Save] -> [Firestore Update]
```

### 6.3 Task Distribution
```
[Tarefas Page] -> [Load Tasks] -> [Expand to Monthly Instances]
  [Filter Current Week] -> [Distribute Among Present Residents]
  [Balance by Total Load] -> [Save to Firestore]
```

**Redistribution:** Separate completed vs pending -> count completed per resident -> redistribute pending (considering total load) -> preserve completed + save new assignments

---

## 7. Data Model

### 7.1 Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `users` | User profiles (name, role, houseId, photoURL) |
| `casas` | Houses (name, address, city, state, CEP) |
| `comodos` | Rooms/areas (name, icon, color, type, houseId) |
| `tarefas` | Registered tasks (title, frequency, priority, houseId) |
| `distribuicoes` | Weekly task distributions (weekId, houseId, assignments) |
| `execucoes` | Task execution history (taskId, executorId, date) |

### 7.2 User Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access: house config, user management, all pages |
| `morador` | View tasks, complete tasks, view events, edit profile |
| `hospede` | Limited access, view and participate in tasks |

### 7.3 Presence
- `isPresent: true` -> Resident is in the house (included in distribution)
- `isPresent: false` -> Resident is away (excluded from distribution)

---

## 8. Interaction Design

### 8.1 Sidebar
- Click Logo: Toggle expanded/collapsed
- Click Nav Item: Navigate + highlight active
- Hover (collapsed): Show tooltip with poetic + real name
- Click Avatar: Open profile drawer

### 8.2 Profile Drawer
- Open: Slide from right with `backdrop-blur-sm` + `bg-black/60`
- Close: Click backdrop or X button
- Edit Mode: Toggle between view and edit states
- Photo: Click -> file picker -> upload to Firebase Storage

### 8.3 Animations

| Element | Animation | Duration |
|---------|-----------|----------|
| Sidebar expand/collapse | Width transition | 300ms |
| Nav text labels | Opacity + translateX | 300ms |
| Profile drawer | Slide translateX + backdrop opacity | 300ms |
| Loading spinner | Spin (CSS) | Infinite |
| Status dots | Pulse (CSS) | Infinite |
| Tooltip | Opacity fade | 150ms |

---

## 9. Mobile Considerations

### 9.1 Capacitor Integration
- **Platform Detection:** `Capacitor.isNativePlatform()`
- **Authentication:** Native Google Sign-In via `@capacitor-firebase/authentication`
- **Push Notifications:** Token registration on app start

### 9.2 Touch Targets
All interactive elements: minimum 44x44px

### 9.3 Input Handling
- Numeric keyboards for phone/CPF
- Email keyboard for email fields
- Formatting: CPF `000.000.000-00`, Phone `(11) 99999-9999`

---

## 10. File Structure

```
src/
|-- components/
|   |-- auth/LoginForm.tsx, ProtectedRoute.tsx
|   |-- ui/ (shadcn/ui components)
|   |-- EmDesenvolvimento.tsx
|   |-- Sidebar.tsx
|-- pages/
|   |-- HomePage.tsx, TarefasPage.tsx, ConfiguracoesPage.tsx
|   |-- CalendarioPage.tsx, ComunicacaoPage.tsx
|   |-- ConquistasPage.tsx, EventosPage.tsx, ProjetosPage.tsx
|   |-- admin/UsersPage.tsx
|-- stores/authStore.ts, houseStore.ts
|-- hooks/usePushNotifications.ts, useFirestoreUser.ts, use-mobile.ts
|-- lib/firebase.ts, utils.ts
|-- utils/formatters.ts
|-- App.tsx, main.tsx, index.css
```

---

## 11. Assets

| Asset | File | Usage |
|-------|------|-------|
| App Logo | `logo.png` (128x128) | Login, Sidebar header |
| Caule Logo | `logo_casa_3.png` | Settings nav icon |

---

## 12. Task Distribution Algorithm

### 12.1 Pool Mensal

1. **Expansion:** Each periodic task expands into N monthly instances
   - `diaria` -> ~28 instances (7 days x 4 weeks)
   - `semanal` multi-days -> N x 4 weeks (e.g., Mon/Wed/Fri -> 12)
   - `semanal` simple -> 4 instances
   - `quinzenal` -> 2 instances
   - `mensal` -> 1 instance

2. **Filtering:** Only current week instances are selected

3. **Distribution:** Each instance assigned to resident with **lowest score**
   - Score: `totalTarefas * 1000 + execucoesDaTarefa`
   - `totalTarefas = atribuidas + concluidas` (total load)

4. **Redistribution:** Preserves completed tasks, redistributes pending considering total historical load.

---

*Document generated from source code analysis of the Caule project.*
*Version: 1.0 | Date: June 2026*
