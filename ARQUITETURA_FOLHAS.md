# Folhas — Arquitetura Completa

## 1. Estrutura de Dados

### 1.1 Cadastro de Tarefas (já existe, campos usados pelo algoritmo)
```
tarefas/{tarefaId}
  titulo: string
  descricao: string
  prioridade: "alta" | "media" | "baixa"
  frequencia: "unica" | "diaria" | "semanal" | "quinzenal" | "mensal"
  diaSemana: number | null      // 0=seg, 1=ter, ..., 5=sab, 6=dom (null = sem dia fixo)
  horarioLimite: string | null  // "10:00" (null = sem limite)
  tipo: "coletiva" | "privada"
  casaId: string
  isActive: boolean
```

### 1.2 Presença/Ausência (NOVO)
```
ausencias/{ausenciaId}
  userId: string
  userName: string
  casaId: string
  tipo: "temporaria" | "periodo"    // temporaria = toggle manual | periodo = datas
  dataInicio: Date | null            // null se temporaria
  dataFim: Date | null               // null se temporaria ou sem fim definido
  ativa: boolean                     // true = ausente agora
  criadaEm: timestamp
```

### 1.3 Distribuição Semanal (NOVO)
```
distribuicoes/{semanaId}             // semanaId = YYYY-MM-DD da segunda-feira
  semanaId: string
  casaId: string
  periodo: { inicio: Date, fim: Date }
  status: "ativa" | "redistribuida" | "arquivada"
  geradaEm: timestamp
  
  atribuicoes: [
    {
      atribuicaoId: string           // id único dentro do array
      tarefaId: string
      titulo: string
      descricao: string
      prioridade: string
      frequencia: string
      diaSemana: number               // 0=seg, 1=ter, ..., 5=sab, 6=dom
      horarioLimite: string | null
      responsavelId: string
      responsavelName: string
      status: "pendente" | "em_andamento" | "concluida" | "cancelada"
      concluidaEm: Date | null
      redistribuidaDe: string | null  // atribuicaoId original (se redistribuída)
    }
  ]
  
  ausenciasConsideradas: [           // snapshot de quem estava ausente
    { userId, userName, tipo, dataInicio?, dataFim? }
  ]
```

### 1.4 Execuções/Histórico (NOVO)
```
execucoes/{execId}
  tarefaId: string
  tarefaTitulo: string
  distribuicaoId: string            // semanaId
  atribuicaoId: string
  executorId: string
  executorName: string
  casaId: string
  dataExecucao: Date
  timestamp: serverTimestamp
```

---

## 2. Algoritmo de Distribuição (executado domingo às 20:00)

### Passo 1: Identificar presentes
```js
// Buscar moradores da casa
moradores = users.filter(u => u.houseId === casaId)

// Verificar ausências ativas para a semana
ausenciasAtivas = ausencias.filter(a => 
  a.casaId === casaId && 
  a.ativa === true &&
  (
    // Ausência temporaria (sem datas) — sempre considera
    (a.tipo === "temporaria") ||
    // Ausência com período que intercepta a semana
    (a.tipo === "periodo" && 
     a.dataInicio <= fimSemana && 
     (a.dataFim === null || a.dataFim >= inicioSemana))
  )
)

ausentesIds = new Set(ausenciasAtivas.map(a => a.userId))
presentes = moradores.filter(m => !ausentesIds.has(m.uid))
```

### Passo 2: Classificar tarefas que entram nesta semana
```js
tarefasEntrantes = []

para cada tarefa em tarefasCadastradas:
  // Buscar última execução
  ultimaExec = execucoes
    .filter(e => e.tarefaId === tarefa.id)
    .sort((a,b) => b.dataExecucao - a.dataExecucao)[0]
  
  diasDesdeUltimaExec = ultimaExec 
    ? (hoje - ultimaExec.dataExecucao) / (1000*60*60*24)
    : Infinity
  
  // Regra de entrada por frequência
  switch (tarefa.frequencia):
    case "unica":
      entra = !ultimaExec                    // só entra se NUNCA foi feita
      
    case "diaria":
      entra = true                            // sempre entra (todos os dias da semana)
      
    case "semanal":
      entra = diasDesdeUltimaExec >= 7       // ou nunca feita
      
    case "quinzenal":
      entra = diasDesdeUltimaExec >= 14      // ou nunca feita
      
    case "mensal":
      entra = diasDesdeUltimaExec >= 30      // ou nunca feita
  
  if (entra) tarefasEntrantes.push(tarefa)
```

### Passo 3: Separar por prioridade
```js
altaFixa = tarefasEntrantes.filter(t => 
  t.prioridade === "alta" && t.diaSemana !== null
)

altaFlexivel = tarefasEntrantes.filter(t =>
  t.prioridade === "alta" && t.diaSemana === null
)

mediaBaixa = tarefasEntrantes.filter(t =>
  t.prioridade === "media" || t.prioridade === "baixa"
)
```

### Passo 4: Rotatividade — escolher responsável
```js
function escolherResponsavel(tarefa, presentes, execucoes) {
  // Score = (número de execuções * peso) - (dias desde última execução)
  // Menor score = prioridade para receber a tarefa
  
  pontuacoes = presentes.map(m => {
    execsDoMorador = execucoes.filter(e => 
      e.tarefaId === tarefa.id && e.executorId === m.uid
    )
    
    numExecs = execsDoMorador.length
    ultimaExec = execsDoMorador.length > 0
      ? Math.max(...execsDoMorador.map(e => e.dataExecucao.getTime()))
      : 0
    
    return {
      morador: m,
      score: numExecs * 1000 - (ultimaExec / 86400000)  // peso alto para numExecs
    }
  })
  
  pontuacoes.sort((a, b) => a.score - b.score)
  return pontuacoes[0].morador
}
```

### Passo 5: Distribuir
```js
atribuicoes = []

// 5.1 Alta com dia fixo → dia exato, rotatividade
altaFixa.forEach(tarefa => {
  responsavel = escolherResponsavel(tarefa, presentes, execucoes)
  atribuicoes.push({
    tarefaId: tarefa.id,
    titulo: tarefa.titulo,
    descricao: tarefa.descricao,
    prioridade: tarefa.prioridade,
    frequencia: tarefa.frequencia,
    diaSemana: tarefa.diaSemana,
    horarioLimite: tarefa.horarioLimite,
    responsavelId: responsavel.uid,
    responsavelName: responsavel.name,
    status: "pendente",
    concluidaEm: null,
    redistribuidaDe: null
  })
})

// 5.2 Alta flexível + Média/Baixa → distribuir na semana
// Contador de tarefas por dia (para balancear)
tarefasPorDia = [0, 0, 0, 0, 0, 0, 0]  // seg a dom

resto = [...altaFlexivel, ...mediaBaixa]
resto.forEach(tarefa => {
  responsavel = escolherResponsavel(tarefa, presentes, execucoes)
  
  // Escolher dia com menos tarefas
  diaMenosOcupado = tarefasPorDia.indexOf(Math.min(...tarefasPorDia))
  // Se alta, tentar respeitar dia se especificado (fallback para dia menos ocupado)
  if (tarefa.prioridade === "alta" && tarefa.diaSemana !== null) {
    dia = tarefa.diaSemana
  } else {
    dia = diaMenosOcupado
  }
  tarefasPorDia[dia]++
  
  atribuicoes.push({...})
})
```

### Passo 6: Balanceamento final
```js
const porMorador = {}
atribuicoes.forEach(a => {
  porMorador[a.responsavelId] = (porMorador[a.responsavelId] || 0) + 1
})

const media = atribuicoes.length / presentes.length

// Se alguém tem 2+ tarefas acima da média, mover tarefas média/baixa
for (const [userId, count] of Object.entries(porMorador)) {
  if (count > media + 2) {
    // Mover tarefa mais flexível para quem tem menos
    const tarefasDoMorador = atribuicoes.filter(a => 
      a.responsavelId === userId && 
      a.prioridade !== "alta"
    )
    // ... mover para morador com menos
  }
}
```

---

## 3. Mecanismo de Ausência

### 3.1 Marcar ausente (toggle simples)
```
Usuário clica "Marcar ausente" → cria doc em ausencias:
  userId, userName, casaId, tipo: "temporaria", ativa: true

Usuário clica "Marcar presente" → atualiza doc:
  ativa: false
```

### 3.2 Cadastrar período de ausência
```
Usuário preenche data início e fim → cria doc:
  userId, userName, casaId, tipo: "periodo",
  dataInicio: Date, dataFim: Date, ativa: true
```

### 3.3 Impacto no algoritmo
- Se ausente ANTES do domingo → não entra na distribuição
- Se ausente DURANTE a semana:
  1. Usuário marca ausente
  2. Sistema envia push para admins: "Lucas se ausentou. Redistribuir tarefas?"
  3. Admin recebe push com botão "Redistribuir"
  4. Ao clicar, algoritmo reexecuta apenas para tarefas pendentes do ausente

### 3.4 Redistribuição durante a semana
```js
function redistribuirTarefasDoAusente(semanaId, ausenteId) {
  // 1. Buscar distribuição atual
  dist = get(distribuicoes/{semanaId})
  
  // 2. Encontrar tarefas pendentes do ausente
  tarefasDoAusente = dist.atribuicoes.filter(a => 
    a.responsavelId === ausenteId && a.status === "pendente"
  )
  
  // 3. Para cada tarefa, encontrar novo responsável
  tarefasDoAusente.forEach(t => {
    presentesAtuais = getPresentesAgora()
    novoResp = escolherResponsavel(t, presentesAtuais, execucoes)
    
    // Atualizar: marcar como redistribuída, criar nova atribuição
    t.status = "cancelada"
    t.redistribuidaDe = t.atribuicaoId
    
    atribuicoes.push({
      ...t,
      atribuicaoId: novoId(),
      responsavelId: novoResp.uid,
      responsavelName: novoResp.name,
      status: "pendente",
      redistribuidaDe: t.atribuicaoId
    })
  })
  
  // 4. Atualizar status da distribuição
  dist.status = "redistribuida"
  save(distribuicoes/{semanaId}, dist)
}
```

---

## 4. Interface (UI)

### 4.1 Calendário (visão coletiva — todos veem tudo)
```
┌──────────────────────────────────────────────────────┐
│  Folhas — Semana 14/06 a 20/06                      │
│  [🔄 Gerar tarefas]  [📋 Minha lista]                │
├──────────────────────────────────────────────────────┤
│                                                      │
│        Seg  Ter  Qua  Qui  Sex  Sáb  Dom             │
│        15   16   17   18   19   20   21            │
│  🧹    ·    ✅   ·    ·    ·    ·    ·   Banheiro  │
│  🧽    ·    ·    ·    ✅   ·    ·    ·   Cozinha   │
│  🧺    ·    ·    ✅   ·    ·    ✅   ·   Roupas    │
│  🗑    ·    ·    ·    ·    ✅   ·    ·   Lixo      │
│                                                      │
│  Legenda: ✅ Concluída  · Pendente  👤 Lucas         │
│                                                      │
│  ▓▓▓ Minhas Tarefas ▓▓▓                            │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🧹 Limpar banheiro    Seg 15    até 10:00    │   │  ← swipe →
│  │    👤 Você                                    │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🧽 Limpar cozinha     Qua 17                │   │  ← swipe →
│  │    👤 Você                                    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [✓] Mostrar tarefas de todos                       │
└──────────────────────────────────────────────────────┘
```

### 4.2 Swipe para concluir
```
Touch start → arrasta → direita > 100px
  → Card fica verde
  → Aparece ✅ no lugar
  → Ao soltar: marca concluída + registra execução
  
Touch start → arrasta → esquerda > 100px
  → Cancela (não faz nada)
```

### 4.3 Ausência (botão flutuante)
```
[👤] Botão no canto inferior direito → abre drawer:
  
  Minha Presença:
  [✓] Presente  [ ] Ausente  ← toggle
  
  Ou cadastrar período:
  De: [14/06/2026]  Até: [20/06/2026]
  [Confirmar ausência]
```

---

## 5. Fluxo de Notificações (Push)

| Evento | Destinatário | Conteúdo |
|---|---|---|
| Geração semanal | Todos | "Novas tarefas da semana disponíveis!" |
| Tarefa atribuída | Individual | "Você tem X tarefas esta semana" |
| Lembrete dia anterior | Individual | "Amanhã: Limpar banheiro (até 10:00)" |
| Usuário se ausenta | Admins | "Lucas se ausentou. Redistribuir tarefas? [Botão]" |
| Horário limite próximo | Individual | "Limpar banheiro deve ser feito até 10:00" |

---

## 6. Decisões Confirmadas

| # | Item | Decisão |
|---|---|---|
| 1 | Geração | Client-side (domingo às 20:00) ou ao abrir Folhas |
| 2 | Início semana | Segunda-feira |
| 3 | Calendário | Visão coletiva (todos veem todas as tarefas) |
| 4 | Lista pessoal | Apenas tarefas do usuário logado |
| 5 | Conclusão | Swipe direita |
| 6 | Tarefas concluídas | Ficam no calendário com ✅ verde |
| 7 | Rotatividade | Score baseado em execuções anteriores |
| 8 | Ausência | Toggle simples + período com datas |
| 9 | Redistribuição | Push para admin + botão manual |
| 10 | Prioridade alta | Dia fixo obrigatório (se cadastrado) |
| 11 | Frequência | Única(1x), Diária(semana), Semanal(7d), Quinzenal(14d), Mensal(30d) |

---

## 7. Próximos Passos de Implementação

1. [ ] Criar coleção `ausencias` no Firestore
2. [ ] Criar coleção `execucoes` no Firestore
3. [ ] Implementar algoritmo de distribuição
4. [ ] Implementar mecanismo de ausência (toggle + período)
5. [ ] Implementar página Folhas (calendário + lista + swipe)
6. [ ] Implementar redistribuição (push para admin)
7. [ ] Implementar notificações push (lembretes, ausência)
8. [ ] Testar rotatividade ao longo de múltiplas semanas
