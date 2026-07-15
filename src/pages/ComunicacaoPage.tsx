import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useHouseStore } from '../stores/houseStore';
import { TopAppBar } from '@/components/TopAppBar';
import { useApp } from '@/App';

interface Mensagem {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  recipientId: string;
  recipientName?: string;
  content: string;
  timestamp: any;
  type: 'coletivo' | 'individual' | 'sistema';
  casaId: string;
  read?: boolean;
}

interface UserData {
  uid: string;
  name: string;
  photoURL?: string;
  role: string;
}

export function ComunicacaoPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const { casaAtual } = useHouseStore();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [novaMsg, setNovaMsg] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'coletivo' | 'individual' | 'sistema'>('todos');
  const [destinatario, setDestinatario] = useState<'coletivo' | string>('coletivo');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addDebug = (msg: string) => {
    console.log(`[ChatDebug] ${msg}`);
    setDebugInfo(prev => [...prev.slice(-4), msg]);
  };

  // Carregar usuarios da casa
  useEffect(() => {
    if (!casaAtual?.id) return;
    const q = query(collection(db, 'users'), where('houseId', '==', casaAtual.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserData))
        .filter((u) => u.uid !== user?.uid);
      setUsers(list);
    }, (err) => {
      console.error('[Chat] Erro ao carregar usuarios:', err);
    });
    return () => unsub();
  }, [casaAtual?.id, user?.uid]);

  // Carregar mensagens — busca simples sem orderBy (nao precisa de indice)
  useEffect(() => {
    if (!casaAtual?.id || !user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErro(null);

    // Query com orderBy — indice composto ATIVADO no Firebase Console
    const q = query(
      collection(db, 'mensagens'),
      where('casaId', '==', casaAtual.id),
      orderBy('timestamp', 'asc')
    );

    addDebug(`Query: casaId=${casaAtual.id}`);

    const unsub = onSnapshot(q, (snap) => {
      addDebug(`OK: ${snap.docs.length} mensagens`);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Mensagem))
        .filter((m) => {
          if (m.type === 'coletivo') return true;
          if (m.type === 'individual') {
            return m.recipientId === user?.uid || m.senderId === user?.uid;
          }
          if (m.type === 'sistema') return true;
          return false;
        });
      setMensagens(list);
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }, (err) => {
      addDebug(`ERRO: ${err.message}`);
      console.error('[Chat] Erro:', err.message);
      setErro(err.message);
      setLoading(false);
    });

    return () => unsub();
  }, [casaAtual?.id, user?.uid]);

  const mensagensFiltradas = mensagens.filter((m) => {
    if (tipoFiltro === 'todos') return true;
    return m.type === tipoFiltro;
  });

  const enviarMensagem = async () => {
    if (!novaMsg.trim() || !user?.uid || !casaAtual?.id) {
      addDebug('Faltando dados para enviar');
      return;
    }
    setEnviando(true);
    setErro(null);
    addDebug(`Enviando: ${novaMsg.trim().slice(0, 20)}...`);
    try {
      const isColetivo = destinatario === 'coletivo';
      const recipientUser = users.find((u) => u.uid === destinatario);

      await addDoc(collection(db, 'mensagens'), {
        senderId: user.uid,
        senderName: user.name || user.email?.split('@')[0] || 'Usuário',
        senderPhoto: user.photoURL || '',
        recipientId: isColetivo ? 'all' : destinatario,
        recipientName: isColetivo ? 'Todos' : recipientUser?.name || '',
        content: novaMsg.trim(),
        timestamp: serverTimestamp(),
        type: isColetivo ? 'coletivo' : 'individual',
        casaId: casaAtual.id,
        read: false,
      });

      setNovaMsg('');
    } catch (e: any) {
      addDebug(`Envio ERRO: ${e.message}`);
      console.error('[Chat] Erro ao enviar:', e);
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getInitials = (name: string) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  // Agrupar mensagens por data
  const grupos: { data: string; msgs: Mensagem[] }[] = [];
  let dataAtual = '';
  mensagensFiltradas.forEach((m) => {
    const d = formatDate(m.timestamp);
    if (d !== dataAtual) {
      dataAtual = d;
      grupos.push({ data: d, msgs: [] });
    }
    grupos[grupos.length - 1].msgs.push(m);
  });

  return (
    <div className="min-h-screen bg-surface pb-24">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Comunicação" titleColor="text-page-raizes" />
      <main className="flex flex-col h-[calc(100dvh-64px-env(safe-area-inset-top)-80px-env(safe-area-inset-bottom))] overflow-hidden">
        {/* Header com filtros */}
        <div className="shrink-0 border-b border-outline-variant bg-surface-container/50 px-4 py-3">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-xl">💬</div>
              <div>
                <h1 className="text-lg font-bold text-page-raizes">Raízes</h1>
                <p className="text-xs text-on-surface-variant">Comunicação da Casa</p>
              </div>
            </div>
            {/* Filtros */}
            <div className="flex gap-1 bg-surface-card rounded-lg p-1 overflow-x-auto">
              {([
                { key: 'todos', label: 'Todos', icon: '💬' },
                { key: 'coletivo', label: 'Coletivo', icon: '🏠' },
                { key: 'individual', label: 'Pessoal', icon: '👤' },
                { key: 'sistema', label: 'Sistema', icon: '⚙️' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTipoFiltro(f.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    tipoFiltro === f.key
                      ? 'bg-page-raizes text-white'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Debug */}
        {debugInfo.length > 0 && (
          <div className="shrink-0 bg-surface-card border-b border-outline-variant px-4 py-2">
            <div className="text-[10px] font-mono text-text-muted space-y-0.5">
              {debugInfo.map((d, i) => (
                <p key={i} className={d.includes('ERRO') ? 'text-error' : d.includes('OK') ? 'text-primary' : 'text-on-surface-variant'}>{d}</p>
              ))}
            </div>
          </div>
        )}

        {/* Erro de permissao */}
        {erro?.includes('permission') || erro?.includes('Permission') ? (
          <div className="shrink-0 bg-error-container/20 border-b border-error/30 px-4 py-3">
            <p className="text-error text-sm font-bold text-center mb-2">Permissao negada no Firestore</p>
            <p className="text-on-surface-variant text-xs text-center mb-2">Va no Firebase Console e adicione estas regras:</p>
            <div className="bg-surface-container-lowest rounded-lg p-3 text-[10px] font-mono text-primary overflow-x-auto">
              match /mensagens/&#123;msgId&#125; &#123;<br/>
              &nbsp;&nbsp;allow read, write: if isAuthenticated();<br/>
              &#125;<br/>
              match /notifications/&#123;notifId&#125; &#123;<br/>
              &nbsp;&nbsp;allow read, create: if isAuthenticated();<br/>
              &#125;
            </div>
          </div>
        ) : erro ? (
          <div className="shrink-0 bg-error-container/20 border-b border-error/30 px-4 py-2">
            <p className="text-error text-xs text-center">{erro}</p>
          </div>
        ) : null}

        {/* Mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-4xl mx-auto space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : grupos.length === 0 ? (
              <div className="text-center py-20">
                <span className="text-5xl">🌱</span>
                <p className="text-on-surface-variant mt-4 text-lg">Nenhuma mensagem ainda</p>
                <p className="text-text-muted text-sm mt-1">Seja o primeiro a iniciar uma conversa!</p>
              </div>
            ) : (
              grupos.map((grupo) => (
                <div key={grupo.data}>
                  {/* Separador de data */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-outline-variant" />
                    <span className="text-xs text-text-muted font-medium">{grupo.data}</span>
                    <div className="flex-1 h-px bg-outline-variant" />
                  </div>

                  <div className="space-y-3">
                    {grupo.msgs.map((msg) => {
                      const isMe = msg.senderId === user?.uid;
                      const isSistema = msg.type === 'sistema';
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${isSistema ? 'justify-center' : ''}`}
                        >
                          {!isSistema && (
                            <div className="shrink-0 self-start">
                              {msg.senderPhoto ? (
                                <img src={msg.senderPhoto} alt={msg.senderName} className="w-10 h-10 rounded-full object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary text-sm font-bold">
                                  {getInitials(msg.senderName)}
                                </div>
                              )}
                            </div>
                          )}

                          <div className={`max-w-[70%] ${isSistema ? 'w-full text-center' : ''}`}>
                            {!isSistema && (
                              <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                                <span className="text-xs font-medium text-on-surface-variant">{msg.senderName}</span>
                                {msg.type === 'coletivo' && <span className="text-[10px] bg-primary-container/30 text-primary px-1.5 py-0.5 rounded-full">🏠 Coletivo</span>}
                                {msg.type === 'individual' && !isMe && <span className="text-[10px] bg-tertiary-container/30 text-tertiary px-1.5 py-0.5 rounded-full">👤 Direta</span>}
                              </div>
                            )}

                            <div
                              className={`rounded-2xl px-4 py-3 ${
                                isSistema
                                  ? 'bg-surface-card/50 border border-outline-variant inline-block'
                                  : isMe
                                  ? 'bg-primary text-on-primary rounded-tr-sm'
                                  : 'bg-surface-card border border-outline-variant rounded-tl-sm'
                              }`}
                            >
                              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isSistema ? 'text-on-surface-variant' : ''}`}>
                                {msg.content}
                              </p>
                              <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-fixed' : 'text-text-muted'}`}>
                                {formatTime(msg.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input de mensagem */}
        <div className="shrink-0 border-t border-outline-variant bg-surface-container/50 px-4 py-3">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Destinatario */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">Para:</span>
              <select
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                className="bg-surface-card border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface min-h-[36px]"
              >
                <option value="coletivo">🏠 Todos da casa</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    👤 {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Campo de texto */}
            <div className="flex gap-2">
              <input
                value={novaMsg}
                onChange={(e) => setNovaMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-4 py-3 bg-surface-card border border-outline-variant rounded-xl text-base text-on-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
              />
              <button
                onClick={enviarMensagem}
                disabled={!novaMsg.trim() || enviando}
                className="px-5 py-3 bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-on-primary font-medium transition-colors min-h-[48px] min-w-[56px] flex items-center justify-center text-lg"
              >
                {enviando ? '...' : '➤'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
