import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useApp } from '@/App';
import { useAuthStore } from '@/stores/authStore';
import { buscarMoradoresEmViagem } from '@/utils/viagens';
import { formatPhoneCompleto } from '@/utils/formatters';
import type { Hospedagem } from '@/utils/hospedagem';

type Pronome = 'ela' | 'ele' | 'elu';

interface Pessoa {
  uid: string;
  name: string;
  photoURL?: string;
  phone?: string;
  role: string;
  pronome?: Pronome;
}

function estadiaAtiva(estadiaInicio?: string, estadiaFim?: string): boolean {
  if (!estadiaInicio || !estadiaFim) return false;
  const hoje = new Date().toISOString().split('T')[0];
  return estadiaInicio <= hoje && estadiaFim > hoje;
}

// Mesma concordancia de genero por pronome usada no cadastro (CadastroPage.tsx)
function rotuloPessoa(pessoa: Pessoa): string {
  if (pessoa.role === 'hospede') return 'Hóspede';
  if (pessoa.pronome === 'ela') return 'Moradora';
  if (pessoa.pronome === 'elu') return 'Moradore';
  return 'Morador';
}

const FAIXA_LABEL: Record<string, string> = { minimo: 'Mínima', ideal: 'Ideal', abundante: 'Abundante' };

function calcularDias(chegada: string, saida: string): number {
  const d1 = new Date(chegada + 'T00:00:00');
  const d2 = new Date(saida + 'T00:00:00');
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

function PessoaCard({ pessoa }: { pessoa: Pessoa }) {
  const telefone = pessoa.phone ? pessoa.phone.replace(/\D/g, '') : '';
  // Sem o "+55" pra caber no card - o link do WhatsApp usa o numero completo de qualquer forma.
  const telefoneCurto = formatPhoneCompleto(pessoa.phone || '').replace(/^\+55\s*/, '');
  return (
    <div className="flex flex-col items-center gap-1 w-24 text-center">
      <UserAvatar photoURL={pessoa.photoURL} name={pessoa.name} size={56} showPresence={false} />
      <span className="text-xs font-bold text-on-surface truncate w-full">{pessoa.name.split(' ')[0]}</span>
      <span className="text-[9px] text-page-ramos leading-none">{rotuloPessoa(pessoa)}</span>
      {telefone ? (
        <a
          href={`https://wa.me/${telefone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 w-full text-[9px] text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[11px] flex-shrink-0">call</span>
          <span className="truncate min-w-0">{telefoneCurto}</span>
        </a>
      ) : (
        <span className="text-[9px] text-on-surface-variant">Sem contato</span>
      )}
    </div>
  );
}

export function UsersPage() {
  const { openMenu, openNotifications } = useApp();
  const { user } = useAuthStore();
  const [presentes, setPresentes] = useState<Pessoa[]>([]);
  const [viajando, setViajando] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [historico, setHistorico] = useState<Hospedagem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);

  async function carregarDados() {
    if (!user?.houseId) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('houseId', '==', user.houseId));
      const snap = await getDocs(q);
      const moradores: Pessoa[] = [];
      const moradoresPresentes: Pessoa[] = [];
      const hospedesPresentes: Pessoa[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.isActive === false) return;
        const pessoa: Pessoa = { uid: d.id, name: data.name || 'Sem nome', photoURL: data.photoURL || '', phone: data.phone || '', role: data.role || 'hospede', pronome: data.pronome };
        if (pessoa.role === 'hospede') {
          if (estadiaAtiva(data.estadiaInicio, data.estadiaFim)) hospedesPresentes.push(pessoa);
          // hospede sem estadia ativa nao aparece em lugar nenhum
        } else {
          moradores.push(pessoa);
          if (data.isPresent !== false) moradoresPresentes.push(pessoa);
        }
      });

      const uidsEmViagem = await buscarMoradoresEmViagem(moradores.map(m => m.uid));
      setViajando(moradores.filter(m => uidsEmViagem.has(m.uid)));
      setPresentes([...moradoresPresentes.filter(m => !uidsEmViagem.has(m.uid)), ...hospedesPresentes]);
    } catch (e) { console.error('[Moradores] Erro ao carregar:', e); }
    setLoading(false);
  }

  async function carregarHistorico() {
    if (!user?.houseId) { setLoadingHistorico(false); return; }
    setLoadingHistorico(true);
    try {
      const q = query(collection(db, 'hospedagens'), where('casaId', '==', user.houseId));
      const snap = await getDocs(q);
      const itens: Hospedagem[] = [];
      snap.forEach(d => itens.push({ id: d.id, ...d.data() } as Hospedagem));
      itens.sort((a, b) => b.chegada.localeCompare(a.chegada));
      setHistorico(itens);
    } catch (e) { console.error('[Moradores] Erro ao carregar histórico de hospedagem:', e); }
    setLoadingHistorico(false);
  }

  useEffect(() => { carregarDados(); }, [user?.houseId]);
  useEffect(() => { carregarHistorico(); }, [user?.houseId]);

  async function togglePagamento(item: Hospedagem) {
    setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusPagamento: !h.statusPagamento } : h));
    try { await updateDoc(doc(db, 'hospedagens', item.id), { statusPagamento: !item.statusPagamento }); }
    catch (e) {
      console.error('[Moradores] Erro ao atualizar pagamento:', e);
      setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusPagamento: item.statusPagamento } : h));
    }
  }

  async function toggleReembolso(item: Hospedagem) {
    setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusReembolso: !h.statusReembolso } : h));
    try { await updateDoc(doc(db, 'hospedagens', item.id), { statusReembolso: !item.statusReembolso }); }
    catch (e) {
      console.error('[Moradores] Erro ao atualizar reembolso:', e);
      setHistorico(prev => prev.map(h => h.id === item.id ? { ...h, statusReembolso: item.statusReembolso } : h));
    }
  }

  // Edicao direta na tabela - atualiza local pra resposta imediata e grava no Firestore.
  // "Dias" e "Contribuicao Total" nunca sao gravados, sao sempre calculados na hora de exibir.
  function atualizarCampoLocal<K extends keyof Hospedagem>(id: string, campo: K, valor: Hospedagem[K]) {
    setHistorico(prev => prev.map(h => h.id === id ? { ...h, [campo]: valor } : h));
  }

  async function salvarCampo<K extends keyof Hospedagem>(id: string, campo: K, valor: Hospedagem[K]) {
    try { await updateDoc(doc(db, 'hospedagens', id), { [campo]: valor, updatedAt: serverTimestamp() }); }
    catch (e) { console.error('[Moradores] Erro ao salvar campo do histórico:', e); }
  }

  async function adicionarLinhaHistorico() {
    if (!user?.houseId) return;
    const hoje = new Date().toISOString().split('T')[0];
    const novo = {
      casaId: user.houseId,
      hospedeUid: '',
      hospedeNome: 'Novo hóspede',
      responsavelUid: '',
      responsavelNome: '',
      chegada: hoje,
      saida: hoje,
      dormitorio: '',
      faixaContribuicao: 'minimo' as const,
      valorContribuicao: 0,
      statusPagamento: false,
      statusReembolso: false,
      createdAt: serverTimestamp(),
    };
    try {
      const ref = await addDoc(collection(db, 'hospedagens'), novo);
      setHistorico(prev => [{ id: ref.id, ...novo, createdAt: undefined }, ...prev]);
    } catch (e) { console.error('[Moradores] Erro ao adicionar linha:', e); }
  }

  async function excluirLinhaHistorico(item: Hospedagem) {
    if (!confirm(`Excluir o registro de hospedagem de ${item.hospedeNome || 'hóspede sem nome'}?`)) return;
    setHistorico(prev => prev.filter(h => h.id !== item.id));
    try { await deleteDoc(doc(db, 'hospedagens', item.id)); }
    catch (e) {
      console.error('[Moradores] Erro ao excluir linha:', e);
      setHistorico(prev => [...prev, item].sort((a, b) => b.chegada.localeCompare(a.chegada)));
    }
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md pb-32">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Moradores"
        titleColor="text-page-ramos" />

      <main className="px-margin-page pb-8">
        <section className="mt-6 mb-8">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-page-ramos">Ramos</h2>
          <p className="font-body-md text-text-muted">Quem está na casa agora</p>
        </section>

        {loading ? (
          <div className="flex justify-center py-8"><span className="material-symbols-outlined animate-spin text-page-ramos text-3xl">refresh</span></div>
        ) : (
          <div className="space-y-8">
            <section>
              <h3 className="text-section-heading font-bold text-on-surface mb-3">Presentes agora</h3>
              {presentes.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguém presente no momento.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {presentes.map(p => <PessoaCard key={p.uid} pessoa={p} />)}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-section-heading font-bold text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">flight</span>
                Viajando
              </h3>
              {viajando.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguém viajando no momento.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {viajando.map(p => <PessoaCard key={p.uid} pessoa={p} />)}
                </div>
              )}
            </section>

            {user?.role !== 'hospede' && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-section-heading font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">history</span>
                    Histórico de Hospedagem
                  </h3>
                  <button
                    onClick={adicionarLinhaHistorico}
                    className="flex items-center gap-1 text-[11px] font-bold text-page-ramos hover:brightness-110 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    Nova linha
                  </button>
                </div>
                {loadingHistorico ? (
                  <div className="flex justify-center py-6"><span className="material-symbols-outlined animate-spin text-page-ramos text-2xl">refresh</span></div>
                ) : historico.length === 0 ? (
                  <p className="text-sm text-text-muted">Nenhuma hospedagem registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto -mx-margin-page px-margin-page">
                    <table className="w-full text-xs border-collapse min-w-[920px]">
                      <thead>
                        <tr className="text-left text-page-ramos border-b border-outline-variant">
                          <th className="py-2 pr-3 font-bold">Hóspede</th>
                          <th className="py-2 pr-3 font-bold">Responsável</th>
                          <th className="py-2 pr-3 font-bold">Chegada</th>
                          <th className="py-2 pr-3 font-bold">Saída</th>
                          <th className="py-2 pr-3 font-bold text-center">Dias</th>
                          <th className="py-2 pr-3 font-bold">Dormitório</th>
                          <th className="py-2 pr-3 font-bold">Faixa</th>
                          <th className="py-2 pr-3 font-bold">Contribuição por dia</th>
                          <th className="py-2 pr-3 font-bold">Contribuição Total</th>
                          <th className="py-2 pr-3 font-bold text-center">Pagamento</th>
                          <th className="py-2 pr-3 font-bold text-center">Reembolso</th>
                          <th className="py-2 pr-1 font-bold text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map(item => {
                          const dias = calcularDias(item.chegada, item.saida);
                          const total = dias * (item.valorContribuicao ?? 0);
                          return (
                            <tr key={item.id} className="border-b border-outline-variant/50">
                              <td className="py-1 pr-3">
                                <input
                                  defaultValue={item.hospedeNome}
                                  onChange={e => atualizarCampoLocal(item.id, 'hospedeNome', e.target.value)}
                                  onBlur={e => salvarCampo(item.id, 'hospedeNome', e.target.value)}
                                  className="w-28 bg-transparent text-on-surface font-bold border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  defaultValue={item.responsavelNome}
                                  onChange={e => atualizarCampoLocal(item.id, 'responsavelNome', e.target.value)}
                                  onBlur={e => salvarCampo(item.id, 'responsavelNome', e.target.value)}
                                  className="w-28 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  type="date"
                                  defaultValue={item.chegada}
                                  onChange={e => { atualizarCampoLocal(item.id, 'chegada', e.target.value); salvarCampo(item.id, 'chegada', e.target.value); }}
                                  className="w-32 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <input
                                  type="date"
                                  defaultValue={item.saida}
                                  onChange={e => { atualizarCampoLocal(item.id, 'saida', e.target.value); salvarCampo(item.id, 'saida', e.target.value); }}
                                  className="w-32 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant text-center font-bold">{dias}</td>
                              <td className="py-1 pr-3">
                                <input
                                  defaultValue={item.dormitorio}
                                  onChange={e => atualizarCampoLocal(item.id, 'dormitorio', e.target.value)}
                                  onBlur={e => salvarCampo(item.id, 'dormitorio', e.target.value)}
                                  className="w-24 bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                />
                              </td>
                              <td className="py-1 pr-3">
                                <select
                                  value={item.faixaContribuicao}
                                  onChange={e => { const v = e.target.value as Hospedagem['faixaContribuicao']; atualizarCampoLocal(item.id, 'faixaContribuicao', v); salvarCampo(item.id, 'faixaContribuicao', v); }}
                                  className="bg-transparent text-on-surface-variant border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                >
                                  {Object.entries(FAIXA_LABEL).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                                </select>
                              </td>
                              <td className="py-1 pr-3">
                                <div className="flex items-center gap-0.5 text-on-surface-variant">
                                  R$
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    defaultValue={item.valorContribuicao ?? 0}
                                    onChange={e => atualizarCampoLocal(item.id, 'valorContribuicao', parseFloat(e.target.value) || 0)}
                                    onBlur={e => salvarCampo(item.id, 'valorContribuicao', parseFloat(e.target.value) || 0)}
                                    className="w-16 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none py-1"
                                  />
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-on-surface font-bold whitespace-nowrap">R$ {total.toFixed(2)}</td>
                              <td className="py-2 pr-3 text-center">
                                <button
                                  onClick={() => togglePagamento(item)}
                                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${item.statusPagamento ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant text-transparent'}`}
                                  title={item.statusPagamento ? 'Pago' : 'Marcar como pago'}
                                >
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                              </td>
                              <td className="py-2 pr-3 text-center">
                                <button
                                  onClick={() => toggleReembolso(item)}
                                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${item.statusReembolso ? 'bg-tertiary border-tertiary text-on-tertiary' : 'border-outline-variant text-transparent'}`}
                                  title={item.statusReembolso ? 'Reembolsado' : 'Marcar como reembolsado'}
                                >
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                              </td>
                              <td className="py-2 pr-1 text-center">
                                <button
                                  onClick={() => excluirLinhaHistorico(item)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center text-error/70 hover:bg-error/10 hover:text-error transition-colors"
                                  title="Excluir linha"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
