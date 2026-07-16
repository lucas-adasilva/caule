import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type Recorrencia = 'nenhuma' | 'semanal' | 'mensal';

export interface Evento {
  id: string;
  casaId: string;
  titulo: string;
  emoji: string;
  descricao: string;
  local: string;
  data: string;      // YYYY-MM-DD - data da primeira/unica ocorrencia
  horario: string;   // HH:MM
  recorrencia: Recorrencia;
  criadoPor: string;
  criadoPorNome: string;
  respostas: Record<string, 'confirmado' | 'recusado'>;
  createdAt?: any;
  updatedAt?: any;
}

// Escapa valores editaveis pelo usuario antes de interpolar no HTML da notificacao
// (renderizado com dangerouslySetInnerHTML em NotificacoesPage.tsx).
function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseDataLocal(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function somarMeses(d: Date, meses: number): Date {
  const diaOriginal = d.getDate();
  const novo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimoDiaDoMes = new Date(novo.getFullYear(), novo.getMonth() + 1, 0).getDate();
  novo.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return novo;
}

/**
 * Calcula a proxima ocorrência do evento a partir de (e incluindo) `referencia`.
 * Retorna null se o evento é único e já passou.
 */
export function proximaOcorrencia(evento: Pick<Evento, 'data' | 'recorrencia'>, referencia: Date): Date | null {
  const inicio = parseDataLocal(evento.data);
  const refSemHora = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());

  if (evento.recorrencia === 'nenhuma') {
    return inicio >= refSemHora ? inicio : null;
  }

  if (evento.recorrencia === 'semanal') {
    if (inicio >= refSemHora) return inicio;
    const diffDias = Math.ceil((refSemHora.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    const semanas = Math.ceil(diffDias / 7);
    const proxima = new Date(inicio);
    proxima.setDate(inicio.getDate() + semanas * 7);
    return proxima;
  }

  // mensal
  if (inicio >= refSemHora) return inicio;
  let proxima = inicio;
  let i = 0;
  while (proxima < refSemHora && i < 240) {
    i++;
    proxima = somarMeses(inicio, i);
  }
  return proxima;
}

/** Verifica se o evento tem uma ocorrência exatamente no dia informado. */
export function eventoOcorreEm(evento: Pick<Evento, 'data' | 'recorrencia'>, dia: Date): boolean {
  const inicio = parseDataLocal(evento.data);
  const alvo = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  if (alvo < inicio) return false;

  if (evento.recorrencia === 'nenhuma') return mesmoDia(inicio, alvo);

  if (evento.recorrencia === 'semanal') {
    const diffDias = Math.round((alvo.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias % 7 === 0;
  }

  // mensal: mesmo dia-do-mes (ou ultimo dia do mes, se o mes do alvo for mais curto)
  const ultimoDiaDoMesAlvo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const diaEsperado = Math.min(inicio.getDate(), ultimoDiaDoMesAlvo);
  return alvo.getDate() === diaEsperado;
}

export { formatarDataLocal, parseDataLocal };

async function buscarMembrosCasa(casaId: string): Promise<{ uid: string; name: string }[]> {
  const q = query(collection(db, 'users'), where('houseId', '==', casaId));
  const snap = await getDocs(q);
  const membros: { uid: string; name: string }[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.isActive === false) return;
    membros.push({ uid: d.id, name: data.name || 'Morador' });
  });
  return membros;
}

/**
 * Notifica os demais moradores/hospedes da casa sobre um evento criado/editado/cancelado.
 * Reusa a colecao `notificacoes` - a Cloud Function `enviarPushNotificacao` ja dispara o
 * push real automaticamente para qualquer doc criado ali.
 */
export async function notificarEvento(
  casaId: string,
  autorUid: string,
  autorNome: string,
  acao: 'criado' | 'editado' | 'cancelado',
  evento: { titulo: string; emoji: string; data: string; horario: string; local: string }
): Promise<void> {
  const membros = await buscarMembrosCasa(casaId);
  const destinatarios = membros.filter((m) => m.uid !== autorUid);
  if (destinatarios.length === 0) return;

  const tituloAcao = acao === 'criado' ? 'Novo Evento' : acao === 'editado' ? 'Evento Alterado' : 'Evento Cancelado';
  const titulo = `${tituloAcao} (${escapeHtml(autorNome)})`;
  const dataFormatada = parseDataLocal(evento.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const mensagem = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;background:#ffffff;border-radius:14px;padding:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:24px;">${escapeHtml(evento.emoji || '📅')}</span>
        <div>
          <p style="margin:0;font-size:15px;color:#6b7280;">${tituloAcao}</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:#fc7c78;">${escapeHtml(evento.titulo)}</p>
        </div>
      </div>
      <p style="margin:10px 0 0 0;font-size:13px;color:#374151;">📅 ${dataFormatada} às ${escapeHtml(evento.horario)} · 📍 ${escapeHtml(evento.local)}</p>
      <p style="margin-top:10px;font-size:11px;color:#9ca3af;text-align:center;">✨ Caule — Sistema de Gestão da Casa</p>
    </div>
  `;

  for (const membro of destinatarios) {
    try {
      await addDoc(collection(db, 'notificacoes'), {
        destinatarioId: membro.uid,
        titulo,
        mensagem,
        tipo: 'sistema',
        lida: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('[Eventos] Erro ao notificar', membro.uid, e);
    }
  }
}
