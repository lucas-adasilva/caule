import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ==========================================
// INTERFACES
// ==========================================

export interface AtribuicaoHistorico {
  data: string;
  tipo: 'distribuicao' | 'redistribuicao' | 'realocacao' | 'adiantamento';
  motivo: string;
  responsavelAnteriorId?: string;
  responsavelAnteriorNome?: string;
  responsavelNovoId?: string;
  responsavelNovoNome?: string;
  semanaOrigem?: string;
  semanaDestino?: string;
}

export interface Atribuicao {
  id: string;
  tarefaId: string;
  titulo: string;
  descricao: string;
  prioridade: 'alta' | 'media' | 'baixa';
  responsavelId: string;
  responsavelNome: string;
  diaSemana: number;
  status: 'pendente' | 'concluída';
  dataConclusao?: string;
  dataPlanejamento?: string;
  historico?: AtribuicaoHistorico[];
}

export interface DistribuicaoSemana {
  id: string;
  weekId: string;
  casaId: string;
  atribuicoes: Atribuicao[];
}

export interface MoradorInfo {
  uid: string;
  name: string;
  role: string;
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

/**
 * Calcula a próxima semana ISO a partir de um weekId.
 * Exemplo: 2026-W30 → 2026-W31, 2026-W52 → 2027-W01
 */
export function proximaSemana(weekId: string): string {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return weekId;
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  // Simplificação: assume 52 semanas por ano
  if (semana >= 52) return `${ano + 1}-W01`;
  return `${ano}-W${String(semana + 1).padStart(2, '0')}`;
}

/**
 * Calcula a semana anterior ISO a partir de um weekId.
 */
export function semanaAnterior(weekId: string): string {
  const match = weekId.match(/(\d+)-W(\d+)/);
  if (!match) return weekId;
  const ano = parseInt(match[1], 10);
  const semana = parseInt(match[2], 10);
  if (semana <= 1) return `${ano - 1}-W52`;
  return `${ano}-W${String(semana - 1).padStart(2, '0')}`;
}

/**
 * Busca a distribuição de uma semana específica.
 * Retorna null se não existir.
 */
export async function buscarDistribuicao(
  casaId: string,
  weekId: string
): Promise<DistribuicaoSemana | null> {
  const q = query(
    collection(db, 'distribuicoes'),
    where('casaId', '==', casaId)
  );
  const snap = await getDocs(q);
  let encontrou: DistribuicaoSemana | null = null;
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data.weekId === weekId && !encontrou) {
      encontrou = {
        id: d.id,
        weekId: data.weekId,
        casaId: data.casaId,
        atribuicoes: (data.atribuicoes || []).map((a: any) => ({
          ...a,
          historico: a.historico || [],
        })),
      };
    }
  });
  return encontrou;
}

/**
 * Busca todos os moradores e hóspedes presentes em uma casa.
 */
export async function buscarMoradoresPresentes(casaId: string): Promise<MoradorInfo[]> {
  const q = query(collection(db, 'users'), where('houseId', '==', casaId));
  const snap = await getDocs(q);
  const hoje = new Date().toISOString().split('T')[0];
  const moradores: MoradorInfo[] = [];

  snap.forEach((d) => {
    const data = d.data();
    if (data.isActive === false) return;

    let estaPresente = false;
    if (data.role === 'hospede') {
      // Hóspede só está presente durante a estadia ativa
      estaPresente =
        data.estadiaInicio &&
        data.estadiaFim &&
        data.estadiaInicio <= hoje &&
        data.estadiaFim > hoje;
    } else {
      // Morador está presente se isPresent !== false
      estaPresente = data.isPresent !== false;
    }

    if (estaPresente) {
      moradores.push({
        uid: d.id,
        name: data.name || 'Morador',
        role: data.role || 'morador',
      });
    }
  });

  return moradores;
}

/**
 * Calcula a carga de tarefas por morador em uma distribuição.
 * Retorna um mapa: { uid: número de tarefas pendentes }
 */
function calcularCarga(
  atribuicoes: Atribuicao[],
  moradores: MoradorInfo[]
): Record<string, number> {
  const carga: Record<string, number> = {};
  moradores.forEach((m) => (carga[m.uid] = 0));
  atribuicoes.forEach((a) => {
    if (a.status === 'pendente' && carga[a.responsavelId] !== undefined) {
      carga[a.responsavelId] = (carga[a.responsavelId] || 0) + 1;
    }
  });
  return carga;
}

/**
 * Adiciona uma entrada no histórico de uma atribuição.
 */
function adicionarHistorico(
  atribuicao: Atribuicao,
  tipo: AtribuicaoHistorico['tipo'],
  motivo: string,
  extra?: Partial<AtribuicaoHistorico>
): Atribuicao {
  const entrada: AtribuicaoHistorico = {
    data: new Date().toISOString(),
    tipo,
    motivo,
    ...extra,
  };
  return {
    ...atribuicao,
    historico: [...(atribuicao.historico || []), entrada],
  };
}

/**
 * Encontra o morador com menor carga.
 */
function moradorComMenorCarga(
  moradores: MoradorInfo[],
  carga: Record<string, number>
): MoradorInfo | null {
  if (moradores.length === 0) return null;
  return moradores.reduce((menor, atual) => {
    const cargaMenor = carga[menor.uid] || 0;
    const cargaAtual = carga[atual.uid] || 0;
    return cargaAtual < cargaMenor ? atual : menor;
  });
}

/**
 * Atualiza uma distribuição no Firestore.
 */
async function salvarDistribuicao(
  distId: string,
  atribuicoes: Atribuicao[]
): Promise<void> {
  await updateDoc(doc(db, 'distribuicoes', distId), {
    atribuicoes,
    updatedAt: serverTimestamp(),
  });
}

// ==========================================
// REDISTRIBUIÇÃO POR SAÍDA (viagem / estadia termina)
// ==========================================

/**
 * Quando um morador sai (viagem ou estadia termina):
 * - Alta prioridade: redistribui para qualquer presente (pode ultrapassar limite)
 * - Média/baixa: redistribui se houver capacidade, senão realoca para semana seguinte
 */
export async function redistribuirPorSaida(
  uidSaindo: string,
  casaId: string,
  weekId: string,
  motivo: 'viagem' | 'estadia_terminada'
): Promise<{ redistribuidas: number; realocadas: number }> {
  const dist = await buscarDistribuicao(casaId, weekId);
  if (!dist) return { redistribuidas: 0, realocadas: 0 };

  const moradores = await buscarMoradoresPresentes(casaId);
  if (moradores.length === 0) return { redistribuidas: 0, realocadas: 0 };

  const carga = calcularCarga(dist.atribuicoes, moradores);
  const textoMotivo =
    motivo === 'viagem'
      ? 'Morador saiu em viagem'
      : 'Hóspede encerrou a estadia';

  const novasAtribuicoes: Atribuicao[] = [];
  const tarefasParaRealocar: Atribuicao[] = [];
  let redistribuidas = 0;
  let realocadas = 0;

  for (const atrib of dist.atribuicoes) {
    // Se não é do morador que saiu, mantém
    if (atrib.responsavelId !== uidSaindo || atrib.status !== 'pendente') {
      novasAtribuicoes.push(atrib);
      continue;
    }

    if (atrib.prioridade === 'alta') {
      // Alta prioridade: redistribui para quem tem menor carga (sem limite)
      const novoResponsavel = moradorComMenorCarga(moradores, carga);
      if (novoResponsavel) {
        carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;
        novasAtribuicoes.push(
          adicionarHistorico(
            { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
            'redistribuicao',
            textoMotivo,
            {
              responsavelAnteriorId: uidSaindo,
              responsavelAnteriorNome: atrib.responsavelNome,
              responsavelNovoId: novoResponsavel.uid,
              responsavelNovoNome: novoResponsavel.name,
            }
          )
        );
        redistribuidas++;
      } else {
        tarefasParaRealocar.push(atrib);
      }
    } else {
      // Média/baixa: redistribui se houver morador com carga < limite
      const LIMITE = 5;
      const disponiveis = moradores.filter((m) => (carga[m.uid] || 0) < LIMITE);
      if (disponiveis.length > 0) {
        const novoResponsavel = moradorComMenorCarga(disponiveis, carga);
        if (novoResponsavel) {
          carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;
          novasAtribuicoes.push(
            adicionarHistorico(
              { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
              'redistribuicao',
              textoMotivo,
              {
                responsavelAnteriorId: uidSaindo,
                responsavelAnteriorNome: atrib.responsavelNome,
                responsavelNovoId: novoResponsavel.uid,
                responsavelNovoNome: novoResponsavel.name,
              }
            )
          );
          redistribuidas++;
        } else {
          tarefasParaRealocar.push(atrib);
        }
      } else {
        tarefasParaRealocar.push(atrib);
      }
    }
  }

  // Realoca tarefas médias/baixas para semana seguinte
  if (tarefasParaRealocar.length > 0) {
    await realocarParaSemanaSeguinte(
      tarefasParaRealocar,
      casaId,
      weekId,
      uidSaindo,
      textoMotivo
    );
    realocadas = tarefasParaRealocar.length;
  }

  // Salva distribuição atualizada
  await salvarDistribuicao(dist.id, novasAtribuicoes);

  return { redistribuidas, realocadas };
}

// ==========================================
// REDISTRIBUIÇÃO POR ENTRADA (retorno / estadia inicia)
// ==========================================

/**
 * Quando alguém entra (retorno de viagem ou estadia inicia):
 * - Todas as tarefas pendentes são redistribuídas entre todos os presentes
 * - Se sobrar capacidade, adianta tarefas de semanas futuras
 */
export async function redistribuirPorEntrada(
  uidEntrando: string,
  casaId: string,
  weekId: string,
  motivo: 'retorno_viagem' | 'estadia_iniciada'
): Promise<{ redistribuidas: number; adiantadas: number }> {
  const dist = await buscarDistribuicao(casaId, weekId);
  if (!dist) return { redistribuidas: 0, adiantadas: 0 };

  const moradores = await buscarMoradoresPresentes(casaId);
  if (moradores.length === 0) return { redistribuidas: 0, adiantadas: 0 };

  const textoMotivo =
    motivo === 'retorno_viagem'
      ? 'Morador retornou de viagem'
      : 'Hóspede iniciou a estadia';

  const carga: Record<string, number> = {};
  moradores.forEach((m) => (carga[m.uid] = 0));

  // Pega apenas tarefas pendentes
  const pendentes = dist.atribuicoes.filter((a) => a.status === 'pendente');
  const concluidas = dist.atribuicoes.filter((a) => a.status === 'concluída');

  // Redistribui todas as pendentes (round-robin por carga)
  const novasAtribuicoes: Atribuicao[] = [...concluidas];

  for (const atrib of pendentes) {
    const sortedMoradores = [...moradores].sort(
      (a, b) => (carga[a.uid] || 0) - (carga[b.uid] || 0)
    );
    const novoResponsavel = sortedMoradores[0];
    if (!novoResponsavel) {
      novasAtribuicoes.push(atrib);
      continue;
    }

    carga[novoResponsavel.uid] = (carga[novoResponsavel.uid] || 0) + 1;

    const foiMudanca = atrib.responsavelId !== novoResponsavel.uid;
    const novaAtrib = foiMudanca
      ? adicionarHistorico(
          { ...atrib, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name },
          'redistribuicao',
          textoMotivo,
          {
            responsavelAnteriorId: atrib.responsavelId,
            responsavelAnteriorNome: atrib.responsavelNome,
            responsavelNovoId: novoResponsavel.uid,
            responsavelNovoNome: novoResponsavel.name,
          }
        )
      : atrib;

    novasAtribuicoes.push(novaAtrib);
  }

  // Calcula capacidade restante
  const LIMITE = 5;
  const DIAS = 6;
  const capacidadeTotal = moradores.length * DIAS * LIMITE;
  const tarefasTotais = novasAtribuicoes.filter((a) => a.status === 'pendente').length;
  const capacidadeSobrando = Math.max(0, capacidadeTotal - tarefasTotais);

  // Adianta tarefas de semanas futuras se houver capacidade
  let adiantadas = 0;
  if (capacidadeSobrando > 0) {
    const resultadoAdiantamento = await adiantarTarefas(
      casaId,
      weekId,
      capacidadeSobrando,
      moradores,
      carga
    );
    novasAtribuicoes.push(...resultadoAdiantamento.tarefasAdiantadas);
    adiantadas = resultadoAdiantamento.tarefasAdiantadas.length;

    // Se adiantou tarefas, salva a semana futura atualizada
    if (resultadoAdiantamento.distFuturaId && resultadoAdiantamento.atribuicoesFuturas) {
      await salvarDistribuicao(
        resultadoAdiantamento.distFuturaId,
        resultadoAdiantamento.atribuicoesFuturas
      );
    }
  }

  // Salva distribuição atualizada
  await salvarDistribuicao(dist.id, novasAtribuicoes);

  return {
    redistribuidas: pendentes.length,
    adiantadas,
  };
}

// ==========================================
// REALOCAÇÃO PARA SEMANA SEGUINTE
// ==========================================

/**
 * Move tarefas de uma semana para a seguinte.
 * Cria a distribuição da semana seguinte se não existir.
 */
async function realocarParaSemanaSeguinte(
  tarefas: Atribuicao[],
  casaId: string,
  weekIdAtual: string,
  uidSaindo: string,
  motivoTexto: string
): Promise<void> {
  const weekIdDestino = proximaSemana(weekIdAtual);

  // Busca distribuição da semana seguinte
  let distDestino = await buscarDistribuicao(casaId, weekIdDestino);

  if (!distDestino) {
    // Cria nova distribuição para semana seguinte
    const novasAtribuicoes = tarefas.map((atrib) =>
      adicionarHistorico(
        {
          ...atrib,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dataPlanejamento: atrib.dataPlanejamento || new Date().toISOString(),
        },
        'realocacao',
        motivoTexto,
        {
          semanaOrigem: weekIdAtual,
          semanaDestino: weekIdDestino,
        }
      )
    );

    await addDoc(collection(db, 'distribuicoes'), {
      casaId,
      weekId: weekIdDestino,
      atribuicoes: novasAtribuicoes,
      createdAt: serverTimestamp(),
    });
    return;
  }

  // Adiciona à distribuição existente
  const atribuicoesAtuais = [...distDestino.atribuicoes];
  for (const atrib of tarefas) {
    atribuicoesAtuais.push(
      adicionarHistorico(
        {
          ...atrib,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dataPlanejamento: atrib.dataPlanejamento || new Date().toISOString(),
        },
        'realocacao',
        motivoTexto,
        {
          semanaOrigem: weekIdAtual,
          semanaDestino: weekIdDestino,
        }
      )
    );
  }

  await salvarDistribuicao(distDestino.id, atribuicoesAtuais);
}

// ==========================================
// ADIANTAMENTO DE TAREFAS
// ==========================================

interface ResultadoAdiantamento {
  tarefasAdiantadas: Atribuicao[];
  distFuturaId?: string;
  atribuicoesFuturas?: Atribuicao[];
}

/**
 * Busca tarefas pendentes de semanas futuras e as traz para a semana atual.
 * Retorna as tarefas que foram adiantadas (para adicionar à semana atual).
 */
async function adiantarTarefas(
  casaId: string,
  weekIdAtual: string,
  quantidadeMaxima: number,
  moradores: MoradorInfo[],
  cargaAtual: Record<string, number>
): Promise<ResultadoAdiantamento> {
  const weekIdFuturo = proximaSemana(weekIdAtual);
  const distFutura = await buscarDistribuicao(casaId, weekIdFuturo);

  if (!distFutura) {
    return { tarefasAdiantadas: [] };
  }

  const tarefasPendentesFuturas = distFutura.atribuicoes.filter(
    (a) => a.status === 'pendente'
  );

  if (tarefasPendentesFuturas.length === 0) {
    return { tarefasAdiantadas: [] };
  }

  const tarefasParaAdiantar = tarefasPendentesFuturas.slice(0, quantidadeMaxima);
  const tarefasAdiantadas: Atribuicao[] = [];

  for (const atrib of tarefasParaAdiantar) {
    const sortedMoradores = [...moradores].sort(
      (a, b) => (cargaAtual[a.uid] || 0) - (cargaAtual[b.uid] || 0)
    );
    const novoResponsavel = sortedMoradores[0];
    if (!novoResponsavel) break;

    cargaAtual[novoResponsavel.uid] = (cargaAtual[novoResponsavel.uid] || 0) + 1;

    tarefasAdiantadas.push(
      adicionarHistorico(
        {
          ...atrib,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          responsavelId: novoResponsavel.uid,
          responsavelNome: novoResponsavel.name,
          dataPlanejamento: atrib.dataPlanejamento || new Date().toISOString(),
        },
        'adiantamento',
        'Capacidade disponível na semana atual — tarefa adiantada',
        {
          semanaOrigem: weekIdFuturo,
          semanaDestino: weekIdAtual,
          responsavelAnteriorId: atrib.responsavelId,
          responsavelAnteriorNome: atrib.responsavelNome,
          responsavelNovoId: novoResponsavel.uid,
          responsavelNovoNome: novoResponsavel.name,
        }
      )
    );
  }

  // Remove as tarefas adiantadas da semana futura
  const idsAdiantados = new Set(tarefasAdiantadas.map((a) => a.tarefaId + '-' + a.diaSemana));
  const atribuicoesFuturasAtualizadas = distFutura.atribuicoes.filter(
    (a) =>
      a.status !== 'pendente' ||
      !idsAdiantados.has(a.tarefaId + '-' + a.diaSemana)
  );

  return {
    tarefasAdiantadas,
    distFuturaId: distFutura.id,
    atribuicoesFuturas: atribuicoesFuturasAtualizadas,
  };
}

// ==========================================
// GERAR DISTRIBUIÇÃO COM HISTÓRICO
// ==========================================

/**
 * Cria uma nova distribuição de tarefas com histórico de distribuição inicial.
 * Usado quando a distribuição é gerada pela primeira vez.
 */
export function criarAtribuicaoComHistorico(
  tarefaId: string,
  titulo: string,
  descricao: string,
  prioridade: 'alta' | 'media' | 'baixa',
  responsavel: MoradorInfo,
  diaSemana: number
): Atribuicao {
  const agora = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tarefaId,
    titulo,
    descricao,
    prioridade,
    responsavelId: responsavel.uid,
    responsavelNome: responsavel.name,
    diaSemana,
    status: 'pendente',
    dataPlanejamento: agora,
    historico: [
      {
        data: agora,
        tipo: 'distribuicao',
        motivo: 'Distribuição inicial da semana',
        responsavelNovoId: responsavel.uid,
        responsavelNovoNome: responsavel.name,
      },
    ],
  };
}
