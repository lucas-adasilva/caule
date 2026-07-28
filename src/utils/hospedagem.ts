import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type FaixaContribuicao = 'minimo' | 'ideal' | 'abundante';

export interface Hospedagem {
  id: string;
  casaId: string;
  hospedeUid: string;
  hospedeNome: string;
  responsavelUid: string;
  responsavelNome: string;
  chegada: string;   // YYYY-MM-DD
  saida: string;      // YYYY-MM-DD
  dormitorio: string;  // nome do comodo
  faixaContribuicao: FaixaContribuicao;
  valorContribuicao: number;
  statusPagamento: boolean;
  statusReembolso: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface DadosHospedagem {
  casaId: string;
  hospedeUid: string;
  hospedeNome: string;
  responsavelUid: string;
  responsavelNome: string;
  chegada: string;
  saida: string;
  dormitorio: string;
  faixaContribuicao: FaixaContribuicao;
  valorContribuicao: number;
}

async function buscarHospedagemAberta(hospedeUid: string): Promise<{ id: string; saida: string } | null> {
  const hoje = new Date().toISOString().split('T')[0];
  const q = query(collection(db, 'hospedagens'), where('hospedeUid', '==', hospedeUid));
  const snap = await getDocs(q);
  let aberta: { id: string; saida: string } | null = null;
  snap.forEach((d) => {
    const data = d.data();
    if (data.saida >= hoje && (!aberta || data.saida > aberta.saida)) {
      aberta = { id: d.id, saida: data.saida };
    }
  });
  return aberta;
}

/**
 * Cria um novo registro no histórico de hospedagem, ou atualiza o existente se o hóspede já
 * tem uma estadia em aberto (saída ainda não passou) - evita duplicar histórico quando é só
 * uma correção de datas da MESMA estadia, em vez de uma visita nova.
 */
export async function salvarHospedagem(dados: DadosHospedagem): Promise<void> {
  const aberta = await buscarHospedagemAberta(dados.hospedeUid);
  if (aberta) {
    await updateDoc(doc(db, 'hospedagens', aberta.id), { ...dados, updatedAt: serverTimestamp() });
  } else {
    await addDoc(collection(db, 'hospedagens'), {
      ...dados,
      statusPagamento: false,
      statusReembolso: false,
      createdAt: serverTimestamp(),
    });
  }
}

/** Corrige a data de saída do registro em aberto (ex: hóspede foi embora antes do previsto). */
export async function encerrarHospedagemAberta(hospedeUid: string, novaSaida: string): Promise<void> {
  const aberta = await buscarHospedagemAberta(hospedeUid);
  if (aberta) {
    await updateDoc(doc(db, 'hospedagens', aberta.id), { saida: novaSaida, updatedAt: serverTimestamp() });
  }
}

/**
 * Mantem o registro de hospedagem em aberto sincronizado quando um ADMIN edita a estadia direto
 * em Configuracoes > Moradores (chegada/saida/dormitorio) - sem isso, a tabela de Historico de
 * Hospedagem fica com datas/dormitorio desatualizados, batendo so com o que o proprio hospede
 * preencheu em algum momento na pagina Estadia. Nao cria registro novo (cadastro do zero pelo
 * admin ainda passa so pela colecao `users`) - so sincroniza se ja existir um em aberto.
 */
export async function sincronizarHospedagemAberta(
  hospedeUid: string,
  campos: Partial<Pick<Hospedagem, 'chegada' | 'saida' | 'dormitorio'>>
): Promise<void> {
  const aberta = await buscarHospedagemAberta(hospedeUid);
  if (aberta) {
    await updateDoc(doc(db, 'hospedagens', aberta.id), { ...campos, updatedAt: serverTimestamp() });
  }
}
