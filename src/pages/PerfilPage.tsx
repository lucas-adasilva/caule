import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';

interface Viagem {
  id: string;
  uid: string;
  destino: string;
  dataSaida: string;
  dataRetorno: string;
  motivo: string;
  createdAt: any;
}

export function PerfilPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [editando, setEditando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [form, setForm] = useState({
    name: user?.name || '',
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    birthDate: user?.birthDate || '',
    cpf: user?.cpf || '',
    pixKey: user?.pixKey || '',
  });

  // Upload de foto de perfil
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function triggerPhotoUpload() {
    fileInputRef.current?.click();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      setErro('Selecione uma imagem válida');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 2MB');
      return;
    }
    setUploadingPhoto(true);
    setErro('');
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL: downloadURL,
        updatedAt: serverTimestamp(),
      });
      setUser({ ...user, photoURL: downloadURL });
      setSucesso('Foto atualizada!');
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      setErro('Erro ao enviar foto: ' + error.message);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Viagens
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [isTraveling, setIsTraveling] = useState(false);
  const [modalViagemOpen, setModalViagemOpen] = useState(false);
  const [editandoViagemId, setEditandoViagemId] = useState<string | null>(null);
  const [formViagem, setFormViagem] = useState({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });

  useEffect(() => { carregarViagens(); }, [user?.uid]);
  useEffect(() => {
    if ((location.state as any)?.openViagem) {
      setModalViagemOpen(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state]);
  useEffect(() => {
    async function checkTraveling() {
      if (!user?.uid) return;
      const { usuarioViajandoAgora } = await import('@/utils/viagens');
      const traveling = await usuarioViajandoAgora(user.uid);
      setIsTraveling(traveling);
    }
    checkTraveling();
  }, [user?.uid, viagens]);

  async function carregarViagens() {
    if (!user?.uid) return;
    try {
      const q = query(collection(db, 'viagens'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      const data: Viagem[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as Viagem));
      data.sort((a, b) => new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime());
      setViagens(data);
    } catch (e: any) { setErro('Erro ao carregar viagens: ' + e.message); }
  }

  function abrirModalNovaViagem() {
    setEditandoViagemId(null);
    setFormViagem({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });
    setErro('');
    setSucesso('');
    setModalViagemOpen(true);
  }

  function abrirModalEditarViagem(v: Viagem) {
    setEditandoViagemId(v.id);
    setFormViagem({ destino: v.destino, dataSaida: v.dataSaida, dataRetorno: v.dataRetorno, motivo: v.motivo || '' });
    setErro('');
    setSucesso('');
    setModalViagemOpen(true);
  }

  function fecharModalViagem() {
    setModalViagemOpen(false);
    setEditandoViagemId(null);
    setFormViagem({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });
    setErro('');
    setSucesso('');
  }

  async function handleSalvarViagem() {
    if (!formViagem.destino.trim() || !formViagem.dataSaida || !formViagem.dataRetorno) { setErro('Preencha destino, saída e retorno'); return; }
    if (formViagem.dataRetorno < formViagem.dataSaida) { setErro('Data de retorno deve ser após a saída'); return; }
    if (!user?.uid) return;
    try {
      const dados = { ...formViagem, uid: user.uid, updatedAt: serverTimestamp() };
      if (editandoViagemId) {
        await updateDoc(doc(db, 'viagens', editandoViagemId), dados);
        setSucesso('Viagem atualizada!');
      } else {
        await addDoc(collection(db, 'viagens'), { ...dados, createdAt: serverTimestamp() });
        setSucesso('Viagem cadastrada!');
      }
      fecharModalViagem();
      carregarViagens();
      if (user.houseId) {
        await redistribuirTarefasPorViagem(formViagem.dataSaida, formViagem.dataRetorno);
      } else {
        console.log('[VIAGEM] user.houseId ausente, nao redistribui');
      }
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function redistribuirTarefasPorViagem(dataSaida: string, dataRetorno: string) {
    if (!user?.uid || !user.houseId) {
      console.log('[REDIST] user.uid ou user.houseId ausente', { uid: user?.uid, houseId: user?.houseId });
      return;
    }
    console.log('[REDIST] Iniciando redistribuicao', { dataSaida, dataRetorno, houseId: user.houseId });
    try {
      const qd = query(collection(db, 'distribuicoes'), where('casaId', '==', user.houseId));
      const sd = await getDocs(qd);
      console.log(`[REDIST] Distribuicoes encontradas: ${sd.docs.length}`);
      const tarefasRealocadasAlta: string[] = [];
      const tarefasAdiadasMediaBaixa: string[] = [];
      let distribuicoesAfetadas = 0;
      for (const distDoc of sd.docs) {
        const distData = distDoc.data();
        console.log(`[REDIST] Doc ${distDoc.id}:`, JSON.stringify(distData).substring(0, 200));
        const weekId = distData.weekId as string;
        if (!weekId) {
          console.log(`[REDIST] Doc ${distDoc.id} sem weekId, ignorando`);
          continue;
        }
        console.log(`[REDIST] Verificando distribuicao ${weekId}`);
        const match = weekId.match(/(\d+)-W(\d+)/);
        if (!match) { console.log(`[REDIST] weekId invalido: ${weekId}`); continue; }
        const ano = parseInt(match[1], 10);
        const semana = parseInt(match[2], 10);
        const jan4 = new Date(ano, 0, 4);
        const primeiroSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
        const inicioSemana = new Date(primeiroSegunda.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
        const fimSemana = new Date(inicioSemana.getTime() + 6 * 24 * 60 * 60 * 1000);
        const inicioStr = inicioSemana.toISOString().split('T')[0];
        const fimStr = fimSemana.toISOString().split('T')[0];
        console.log(`[REDIST] Semana ${weekId}: ${inicioStr} a ${fimStr}. Viagem: ${dataSaida} a ${dataRetorno}`);
        if (dataRetorno < inicioStr || dataSaida > fimStr) {
          console.log(`[REDIST] Viagem nao afeta esta semana`);
          continue;
        }
        const atribuicoes: any[] = distData.atribuicoes || [];
        console.log(`[REDIST] Total atribuicoes: ${atribuicoes.length}`);
        const outrasAtribuicoes = atribuicoes.filter((a: any) => a.responsavelId !== user.uid || a.status === 'concluida');
        const tarefasDoViajante = atribuicoes.filter((a: any) => a.responsavelId === user.uid && a.status === 'pendente');
        console.log(`[REDIST] Tarefas do viajante: ${tarefasDoViajante.length}`);
        if (tarefasDoViajante.length === 0) continue;
        distribuicoesAfetadas++;
        const qu = query(collection(db, 'users'), where('houseId', '==', user.houseId));
        const su = await getDocs(qu);
        const outrosMoradores: any[] = [];
        su.forEach(d => {
          const udata = d.data();
          if (d.id !== user.uid && udata.isActive !== false && udata.isPresent === true) {
            outrosMoradores.push({ uid: d.id, name: udata.name || 'Morador' });
          }
        });
        console.log(`[REDIST] Outros moradores disponiveis: ${outrosMoradores.length}`);
        const novasAtribuicoes = [...outrasAtribuicoes];
        for (const tarefa of tarefasDoViajante) {
          console.log(`[REDIST] Processando tarefa: ${tarefa.titulo} (prioridade: ${tarefa.prioridade})`);
          if (tarefa.prioridade === 'alta') {
            if (outrosMoradores.length > 0) {
              const substituto = outrosMoradores[0];
              novasAtribuicoes.push({ ...tarefa, responsavelId: substituto.uid, responsavelNome: substituto.name });
              tarefasRealocadasAlta.push(tarefa.titulo);
              console.log(`[REDIST] Realocada para ${substituto.name}`);
            } else {
              console.log(`[REDIST] Nenhum morador disponivel para realocar`);
            }
          } else {
            tarefasAdiadasMediaBaixa.push(tarefa.titulo);
            console.log(`[REDIST] Adiada (removida)`);
          }
        }
        await updateDoc(doc(db, 'distribuicoes', distDoc.id), { atribuicoes: novasAtribuicoes });
        console.log(`[REDIST] Distribuicao ${weekId} atualizada`);
      }
      console.log(`[REDIST] Resumo: ${tarefasRealocadasAlta.length} alta, ${tarefasAdiadasMediaBaixa.length} media/baixa, ${distribuicoesAfetadas} semanas afetadas`);
      if (tarefasRealocadasAlta.length > 0 || tarefasAdiadasMediaBaixa.length > 0) {
        await notificarAdminRealocacao(tarefasRealocadasAlta, tarefasAdiadasMediaBaixa);
        const resumoMsg = `Redistribuicao completa: ${tarefasRealocadasAlta.length} tarefa(s) alta prioridade realocadas, ${tarefasAdiadasMediaBaixa.length} tarefa(s) media/baixa adiadas.`;
        setSucesso(prev => prev ? prev + ' ' + resumoMsg : resumoMsg);
      } else if (distribuicoesAfetadas > 0) {
        setSucesso(prev => prev ? prev + ' Nenhuma tarefa pendente afetada.' : 'Nenhuma tarefa pendente afetada.');
      } else {
        setSucesso(prev => prev ? prev + ' Nenhuma distribuicao afetada pela viagem.' : 'Nenhuma distribuicao afetada pela viagem.');
      }
    } catch (e: any) {
      console.error('[REDIST] Erro ao redistribuir:', e);
      setErro('Erro na redistribuicao: ' + e.message);
    }
  }

  async function notificarAdminRealocacao(tarefasAlta: string[], tarefasMediaBaixa: string[]) {
    if (!user?.uid || !user.houseId) return;
    try {
      const qu = query(collection(db, 'users'), where('houseId', '==', user.houseId), where('role', '==', 'admin'));
      const su = await getDocs(qu);
      const admins: string[] = [];
      su.forEach(d => admins.push(d.id));
      if (admins.length === 0) return;
      const mensagem = `${user.name || 'Um morador'} cadastrou uma viagem. ` +
        (tarefasAlta.length > 0 ? `Tarefas alta prioridade realocadas: ${tarefasAlta.join(', ')}. ` : '') +
        (tarefasMediaBaixa.length > 0 ? `Tarefas média/baixa adiadas: ${tarefasMediaBaixa.join(', ')}.` : '');
      for (const adminId of admins) {
        await addDoc(collection(db, 'notificacoes'), {
          destinatarioId: adminId,
          titulo: 'Realocação de tarefas por viagem',
          mensagem,
          tipo: 'realocacao',
          lida: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error('Erro ao notificar admin:', e); }
  }

  async function handleDuplicarViagem(v: Viagem) {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, 'viagens'), {
        uid: user.uid,
        destino: v.destino + ' (Cópia)',
        dataSaida: v.dataSaida,
        dataRetorno: v.dataRetorno,
        motivo: v.motivo || '',
        createdAt: serverTimestamp(),
      });
      setSucesso('Viagem duplicada!');
      carregarViagens();
    } catch (e: any) { setErro('Erro ao duplicar: ' + e.message); }
  }

  async function handleExcluirViagem(id: string) {
    if (!confirm('Excluir esta viagem?')) return;
    try { await deleteDoc(doc(db, 'viagens', id)); setSucesso('Viagem excluída!'); carregarViagens(); }
    catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function salvarPerfil() {
    if (!user?.uid) return;
    setLoading(true); setErro(''); setSucesso('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { ...form, updatedAt: serverTimestamp() });
      setUser({ ...user, ...form });
      setSucesso('Perfil atualizado!');
      setEditando(false);
    } catch (e: any) { setErro('Erro ao salvar: ' + e.message); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md pb-32">
      <TopAppBar title="Perfil" showAvatar={false} showMenu={false} showNotifications={false} showBackButton={true} onBackClick={() => navigate(-1)} />

      <main className="px-margin-page mt-stack-md space-y-6">
        {/* Header com avatar */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="relative">
            <UserAvatar
              photoURL={user?.photoURL}
              name={user?.name}
              isPresent={user?.isPresent}
              isTraveling={isTraveling}
              size={96}
            />
            {/* Botão de câmera — canto inferior esquerdo para não cobrir o indicador de presença */}
            <button
              onClick={triggerPhotoUpload}
              disabled={uploadingPhoto}
              className="absolute -bottom-1 -left-1 w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-surface hover:brightness-110 transition-all disabled:opacity-50 z-10"
              title="Tirar foto ou escolher da galeria"
            >
              <span className="material-symbols-outlined text-on-primary text-lg">photo_camera</span>
            </button>
            {uploadingPhoto && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <div className="text-center">
            <h2 className="font-bold text-xl text-on-surface">{user?.name || 'Morador'}</h2>
            <p className="text-caption text-on-surface-variant">{user?.email}</p>
            {isTraveling && <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[10px]">flight</span>Em viagem</p>}
          </div>
        </div>

        {/* Dados pessoais */}
        <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-on-surface">Dados Pessoais</h3>
            {!editando ? (
              <button onClick={() => setEditando(true)} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"><span className="material-symbols-outlined">edit</span></button>
            ) : (
              <div className="flex gap-1">
                <button onClick={salvarPerfil} disabled={loading} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"><span className="material-symbols-outlined">check</span></button>
                <button onClick={() => { setEditando(false); setForm({ name: user?.name || '', fullName: user?.fullName || '', phone: user?.phone || '', birthDate: user?.birthDate || '', cpf: user?.cpf || '', pixKey: user?.pixKey || '' }); }} className="p-2 text-error hover:bg-error/10 rounded-full transition-colors"><span className="material-symbols-outlined">close</span></button>
              </div>
            )}
          </div>

          {erro && <div className="p-3 bg-error-container/20 border border-error/30 rounded-lg text-error text-sm">{erro}</div>}
          {sucesso && <div className="p-3 bg-primary-container/20 border border-primary/30 rounded-lg text-primary text-sm">{sucesso}</div>}

          {editando ? (
            <div className="space-y-3">
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Nome</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Nome Completo</label><input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Telefone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Data de Nascimento</label><input type="date" value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">CPF</label><input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Chave Pix</label><input value={form.pixKey} onChange={e => setForm({ ...form, pixKey: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-outline-variant/30"><span className="text-on-surface-variant">Nome completo</span><span className="text-on-surface">{user?.fullName || '-'}</span></div>
              <div className="flex justify-between py-1 border-b border-outline-variant/30"><span className="text-on-surface-variant">Telefone</span><span className="text-on-surface">{user?.phone || '-'}</span></div>
              <div className="flex justify-between py-1 border-b border-outline-variant/30"><span className="text-on-surface-variant">Nascimento</span><span className="text-on-surface">{user?.birthDate || '-'}</span></div>
              <div className="flex justify-between py-1 border-b border-outline-variant/30"><span className="text-on-surface-variant">CPF</span><span className="text-on-surface">{user?.cpf || '-'}</span></div>
              <div className="flex justify-between py-1"><span className="text-on-surface-variant">Chave Pix</span><span className="text-on-surface">{user?.pixKey || '-'}</span></div>
            </div>
          )}
        </div>

        {/* Minhas Viagens */}
        <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-on-surface">Minhas Viagens</h3>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{viagens.length}</span>
          </div>
          {viagens.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">Nenhuma viagem cadastrada</p>
          ) : (
            <div className="space-y-3">
              {viagens.map(v => {
                const hoje = new Date().toISOString().split('T')[0];
                const status = v.dataRetorno < hoje ? 'Concluída' : v.dataSaida > hoje ? 'Planejada' : 'Em andamento';
                const statusColor = status === 'Concluída' ? 'bg-secondary/10 text-secondary' : status === 'Em andamento' ? 'bg-tertiary/10 text-tertiary' : 'bg-primary/10 text-primary';
                return (
                  <div key={v.id} className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/30">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColor}`}>{status}</span>
                          <h4 className="font-bold text-sm text-on-surface truncate">{v.destino}</h4>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-1">{v.dataSaida} → {v.dataRetorno}</p>
                        {v.motivo && <p className="text-[10px] text-on-surface-variant mt-1">{v.motivo}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => abrirModalEditarViagem(v)} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                        <button onClick={() => handleDuplicarViagem(v)} className="p-1.5 text-[#2196F3] hover:bg-[#2196F3]/10 rounded-lg"><span className="material-symbols-outlined text-lg">content_copy</span></button>
                        <button onClick={() => handleExcluirViagem(v.id)} className="p-1.5 text-error hover:bg-error/10 rounded-lg"><span className="material-symbols-outlined text-lg">delete</span></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Botao Cadastrar Viagem */}
        <button onClick={abrirModalNovaViagem} className="w-full bg-primary/10 text-primary border border-primary/30 font-bold py-3 rounded-xl hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">flight</span>
          Cadastrar Viagem
        </button>
      </main>

      {/* Modal Viagem */}
      {modalViagemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={fecharModalViagem} />
          <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <button onClick={fecharModalViagem} className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-surface-container">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
                <span className="text-sm font-medium">Voltar</span>
              </button>
              <h3 className="font-section-heading text-section-heading text-sm">{editandoViagemId ? 'Editar Viagem' : 'Nova Viagem'}</h3>
              <button onClick={fecharModalViagem} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant text-xl">close</span>
              </button>
            </div>
            {erro && <div className="p-3 bg-error-container/20 border border-error/30 rounded-lg text-error text-sm">{erro}</div>}
            {sucesso && <div className="p-3 bg-primary-container/20 border border-primary/30 rounded-lg text-primary text-sm">{sucesso}</div>}
            <input value={formViagem.destino} onChange={e => setFormViagem({ ...formViagem, destino: e.target.value })} placeholder="Destino" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Saída</label><input type="date" value={formViagem.dataSaida} onChange={e => setFormViagem({ ...formViagem, dataSaida: e.target.value })} min={new Date().toISOString().split('T')[0]} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Retorno</label><input type="date" value={formViagem.dataRetorno} onChange={e => setFormViagem({ ...formViagem, dataRetorno: e.target.value })} min={formViagem.dataSaida || new Date().toISOString().split('T')[0]} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
            </div>
            <textarea value={formViagem.motivo} onChange={e => setFormViagem({ ...formViagem, motivo: e.target.value })} placeholder="Motivo (opcional)" rows={2} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={handleSalvarViagem} className="flex-1 bg-primary-container text-on-primary-container font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">{editandoViagemId ? 'Atualizar' : 'Criar'}</button>
              <button onClick={fecharModalViagem} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
