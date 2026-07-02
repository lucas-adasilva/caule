import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Verifica se um usuário está em viagem no momento (hoje está entre dataSaida e dataRetorno)
 * Busca TODAS as viagens do usuário e filtra no cliente para evitar índice composto
 */
export async function usuarioViajandoAgora(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'viagens'), where('uid', '==', uid));
    const snap = await getDocs(q);
    let emViagem = false;
    snap.forEach(d => {
      const data = d.data();
      if (data.dataSaida <= hoje && data.dataRetorno > hoje) {
        emViagem = true;
      }
    });
    return emViagem;
  } catch (e) {
    console.error('Erro ao verificar viagem:', e);
    return false;
  }
}

/**
 * Busca todos os UIDs em viagem de uma lista de moradores
 * Busca TODAS as viagens e filtra no cliente para evitar índice composto
 */
export async function buscarMoradoresEmViagem(uids: string[]): Promise<Set<string>> {
  if (!uids || uids.length === 0) return new Set();
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const emViagem = new Set<string>();
    const batchSize = 10;
    for (let i = 0; i < uids.length; i += batchSize) {
      const batch = uids.slice(i, i + batchSize);
      const q = query(collection(db, 'viagens'), where('uid', 'in', batch));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        if (data.dataSaida <= hoje && data.dataRetorno > hoje) {
          emViagem.add(data.uid);
        }
      });
    }
    return emViagem;
  } catch (e) {
    console.error('Erro ao buscar moradores em viagem:', e);
    return new Set();
  }
}

/**
 * Busca a primeira viagem ativa de um usuário
 */
export async function buscarViagemAtiva(uid: string): Promise<{ id: string; destino: string; dataSaida: string; dataRetorno: string } | null> {
  if (!uid) return null;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'viagens'), where('uid', '==', uid));
    const snap = await getDocs(q);
    let viagem: { id: string; destino: string; dataSaida: string; dataRetorno: string } | null = null;
    snap.forEach(d => {
      const data = d.data();
      if (data.dataSaida <= hoje && data.dataRetorno > hoje) {
        viagem = {
          id: d.id,
          destino: data.destino || '',
          dataSaida: data.dataSaida || '',
          dataRetorno: data.dataRetorno || '',
        };
      }
    });
    return viagem;
  } catch (e) {
    console.error('Erro ao buscar viagem ativa:', e);
    return null;
  }
}

/**
 * Atualiza a data de retorno de uma viagem para hoje (interrompe viagem antecipadamente)
 */
export async function interromperViagem(viagemId: string): Promise<void> {
  if (!viagemId) return;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'viagens', viagemId), {
      dataRetorno: hoje,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('Erro ao interromper viagem:', e);
    throw e;
  }
}

/**
 * Redistribui tarefas quando um morador retorna de viagem
 * - Tarefas pendentes da semana atual são redistribuídas entre todos os moradores presentes
 * - Tarefas adiadas (média/baixa) são incluídas na redistribuição
 */
export async function redistribuirTarefasPorRetorno(uid: string, houseId: string): Promise<void> {
  if (!uid || !houseId) return;
  try {
    const today = new Date();
    const ano = today.getFullYear();
    const primeiraSegunda = new Date(ano, 0, 1);
    const diasDesdeInicio = Math.floor((today.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7);
    const weekId = `${ano}-W${String(semana).padStart(2, '0')}`;

    // Buscar distribuição da semana atual
    const qDist = query(collection(db, 'distribuicoes'), where('casaId', '==', houseId));
    const sDist = await getDocs(qDist);
    let distDoc: any = null;
    sDist.forEach(d => {
      const data = d.data();
      if (data.weekId === weekId) {
        distDoc = { id: d.id, ...data };
      }
    });
    if (!distDoc) return;

    const atribuicoes: any[] = distDoc.atribuicoes || [];
    
    // Buscar outros moradores presentes
    const qu = query(collection(db, 'users'), where('houseId', '==', houseId));
    const su = await getDocs(qu);
    const moradores: any[] = [];
    su.forEach(d => {
      const udata = d.data();
      if (udata.isActive !== false && udata.isPresent === true) {
        moradores.push({ uid: d.id, name: udata.name || 'Morador' });
      }
    });

    // Separar tarefas que precisam ser redistribuídas
    // (pendentes que foram atribuídas a outro morador durante a viagem + tarefas adiadas)
    const tarefasParaRedistribuir = atribuicoes.filter((a: any) => {
      // Tarefas pendentes atribuídas a outros moradores durante a viagem (o viajante era o original)
      // Ou tarefas adiadas que sumiram da distribuição
      return a.status === 'pendente' && a.responsavelId !== uid;
    });

    if (tarefasParaRedistribuir.length === 0 && moradores.length <= 1) return;

    // Redistribuir usando round-robin
    const cargaPorMorador: Record<string, number> = {};
    moradores.forEach(m => cargaPorMorador[m.uid] = 0);
    
    atribuicoes.forEach((a: any) => {
      if (a.status === 'pendente' && cargaPorMorador[a.responsavelId] !== undefined) {
        cargaPorMorador[a.responsavelId] = (cargaPorMorador[a.responsavelId] || 0) + 1;
      }
    });

    let idx = 0;
    const novasAtribuicoes = atribuicoes.map((a: any) => {
      if (a.status === 'pendente' && a.responsavelId !== uid && moradores.some((m: any) => m.uid === uid)) {
        // Encontrar morador com menor carga
        const sortedMoradores = moradores.sort((a: any, b: any) => (cargaPorMorador[a.uid] || 0) - (cargaPorMorador[b.uid] || 0));
        const novoResponsavel = sortedMoradores[idx % sortedMoradores.length];
        idx++;
        cargaPorMorador[novoResponsavel.uid] = (cargaPorMorador[novoResponsavel.uid] || 0) + 1;
        return { ...a, responsavelId: novoResponsavel.uid, responsavelNome: novoResponsavel.name };
      }
      return a;
    });

    await updateDoc(doc(db, 'distribuicoes', distDoc.id), { atribuicoes: novasAtribuicoes });
  } catch (e) {
    console.error('Erro ao redistribuir tarefas por retorno:', e);
    throw e;
  }
}
