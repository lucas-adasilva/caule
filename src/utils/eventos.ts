import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type Recorrencia = 'nenhuma' | 'semanal' | 'mensal';
export type TipoEvento = 'coletivo' | 'privado';

export interface Evento {
  id: string;
  casaId: string;
  titulo: string;
  emoji: string;
  descricao: string;
  local: string;             // nome do comodo (opcional) - texto livre vazio se nao definido
  horario: string;           // HH:MM
  recorrencia: Recorrencia;
  data?: string;              // YYYY-MM-DD - so quando recorrencia === 'nenhuma'
  diasSemana?: string[];       // '0'..'6' (Seg=0..Dom=6) - so quando recorrencia === 'semanal'
  diasMes?: number[];          // 1..31 - so quando recorrencia === 'mensal'
  tipo: TipoEvento;
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

export function parseDataLocal(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Seg=0 ... Dom=6, mesma convencao usada no resto do app (distribuicao de tarefas). */
export function diaSemanaDe(d: Date): number {
  return (d.getDay() + 6) % 7;
}

type EventoOcorrencia = Pick<Evento, 'recorrencia' | 'data' | 'diasSemana' | 'diasMes'>;

/** Verifica se o evento tem uma ocorrência exatamente no dia informado. */
export function eventoOcorreEm(evento: EventoOcorrencia, dia: Date): boolean {
  if (evento.recorrencia === 'nenhuma') {
    if (!evento.data) return false;
    return mesmoDia(parseDataLocal(evento.data), dia);
  }
  if (evento.recorrencia === 'semanal') {
    return (evento.diasSemana || []).includes(String(diaSemanaDe(dia)));
  }
  // mensal
  return (evento.diasMes || []).includes(dia.getDate());
}

/**
 * Calcula a proxima ocorrência do evento a partir de (e incluindo) `referencia`.
 * Retorna null se o evento é único e já passou, ou se não tem nenhum dia configurado.
 */
export function proximaOcorrencia(evento: EventoOcorrencia, referencia: Date): Date | null {
  const refSemHora = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  for (let i = 0; i < 60; i++) {
    const candidato = new Date(refSemHora);
    candidato.setDate(refSemHora.getDate() + i);
    if (eventoOcorreEm(evento, candidato)) return candidato;
  }
  return null;
}

const DIAS_SEMANA_LABEL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/** Descreve a recorrência de forma legível: "Toda quarta e sexta", "Todo dia 5 e 15", etc. */
export function descreverRecorrencia(evento: EventoOcorrencia): string {
  if (evento.recorrencia === 'semanal') {
    const dias = (evento.diasSemana || []).map(Number).sort((a, b) => a - b).map(i => DIAS_SEMANA_LABEL[i]);
    if (dias.length === 0) return 'Toda semana';
    return `Toda ${dias.join(', ')}`;
  }
  if (evento.recorrencia === 'mensal') {
    const dias = (evento.diasMes || []).sort((a, b) => a - b);
    if (dias.length === 0) return 'Todo mês';
    return `Todo dia ${dias.join(', ')} do mês`;
  }
  return '';
}

// Emoji automático baseado no título do evento - mesma ideia do sugerirEmoji() usado
// no cadastro de cômodos/tarefas em ConfiguracoesPage.tsx.
export function sugerirEmojiEvento(titulo: string): string {
  const lower = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const map: Record<string, string> = {
    'festa junina': '🌽', 'ano novo': '🎆', 'happy hour': '🍻',
    aniversario: '🎂', niver: '🎂', parabens: '🎂',
    jantar: '🍽️', almoco: '🍽️', brunch: '🍽️', cafe: '☕',
    churrasco: '🍖', churras: '🍖', bbq: '🍖',
    festa: '🎉', comemoracao: '🎉', confraternizacao: '🎉', celebracao: '🎉',
    cinema: '🎬', filme: '🎬', serie: '🎬',
    jogo: '🎮', game: '🎮', videogame: '🎮',
    futebol: '⚽', bola: '⚽',
    limpeza: '🧹', faxina: '🧹', arrumacao: '🧹', organizacao: '🧹',
    reuniao: '📋', assembleia: '📋', combinado: '📋',
    viagem: '✈️', passeio: '🚗', praia: '🏖️',
    musica: '🎵', show: '🎵', karaoke: '🎤', banda: '🎸',
    bebida: '🍻', cerveja: '🍺', vinho: '🍷', drinks: '🍹',
    yoga: '🧘', meditacao: '🧘', treino: '💪', academia: '💪',
    piscina: '🏊', natacao: '🏊',
    jardim: '🌱', plantio: '🌱', horta: '🌱', planta: '🌱',
    natal: '🎄', pascoa: '🐰',
    manutencao: '🔧', conserto: '🔧', reparo: '🔧',
    mercado: '🛒', compras: '🛒',
  };
  for (const [key, emoji] of Object.entries(map)) {
    if (lower.includes(key)) return emoji;
  }
  return '📅';
}

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
 * Eventos privados nao notificam ninguem. Reusa a colecao `notificacoes` - a Cloud Function
 * `enviarPushNotificacao` ja dispara o push real automaticamente para qualquer doc criado ali.
 */
export async function notificarEvento(
  casaId: string,
  autorUid: string,
  autorNome: string,
  acao: 'criado' | 'editado' | 'cancelado',
  evento: { titulo: string; emoji: string; horario: string; local: string; tipo: TipoEvento }
): Promise<void> {
  if (evento.tipo === 'privado') return;

  const membros = await buscarMembrosCasa(casaId);
  const destinatarios = membros.filter((m) => m.uid !== autorUid);
  if (destinatarios.length === 0) return;

  const tituloAcao = acao === 'criado' ? 'Novo Evento' : acao === 'editado' ? 'Evento Alterado' : 'Evento Cancelado';
  const titulo = `${tituloAcao} (${escapeHtml(autorNome)})`;
  const localTexto = evento.local ? ` · 📍 ${escapeHtml(evento.local)}` : '';
  const mensagem = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;background:#ffffff;border-radius:14px;padding:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:24px;">${escapeHtml(evento.emoji || '📅')}</span>
        <div>
          <p style="margin:0;font-size:15px;color:#6b7280;">${tituloAcao}</p>
          <p style="margin:0;font-size:17px;font-weight:700;color:#fc7c78;">${escapeHtml(evento.titulo)}</p>
        </div>
      </div>
      <p style="margin:10px 0 0 0;font-size:13px;color:#374151;">🕐 ${escapeHtml(evento.horario)}${localTexto}</p>
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
