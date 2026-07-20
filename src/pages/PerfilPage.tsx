import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { Capacitor } from '@capacitor/core';
import { redistribuirPorSaida, redistribuirPorEntrada } from '@/utils/distribuicao';
import { getSemanaDaData, getIntervaloSemana, sobrepoeSemanaAtual } from '@/utils/semana';
import { existeViagemSobrepondoPeriodo } from '@/utils/viagens';

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
  const { forceCheck, checking: checkingVersion, currentVersion, hasUpdate, versionInfo, downloadUpdate } = useVersionCheck();
  const isNative = Capacitor.isNativePlatform();

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
    if (file.size > 4 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 4MB');
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
      const viagemOriginal = editandoViagemId ? viagens.find(v => v.id === editandoViagemId) || null : null;
      const isCadastro = !editandoViagemId;
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
        await redistribuirPorViagemAlterada(viagemOriginal, formViagem.dataSaida, formViagem.dataRetorno, isCadastro);
      }
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  // Redistribui via utils/distribuicao.ts (regras oficiais) somente se a presença na semana
  // atual mudou (viagem passou a cobrir a semana ou deixou de cobrir).
  async function redistribuirPorViagemAlterada(
    original: Viagem | null,
    novaDataSaida: string,
    novaDataRetorno: string,
    isCadastro: boolean
  ) {
    if (!user?.uid || !user.houseId) return;
    const sobrepoeAntes = original ? sobrepoeSemanaAtual(original.dataSaida, original.dataRetorno) : false;
    const sobrepoeDepois = sobrepoeSemanaAtual(novaDataSaida, novaDataRetorno);
    if (sobrepoeAntes === sobrepoeDepois) return;
    const semana = getSemanaDaData(new Date());
    try {
      if (sobrepoeDepois) {
        const titulo = isCadastro ? 'Tarefas Redistribuídas - Cadastro de Viagem' : 'Tarefas Redistribuídas - Alteração de Viagem';
        const resultado = await redistribuirPorSaida(user.uid, user.houseId, semana.weekId, 'viagem', titulo);
        if (resultado.redistribuidas > 0 || resultado.realocadas > 0) {
          setSucesso(prev => `${prev} ${resultado.redistribuidas} tarefa(s) redistribuída(s), ${resultado.realocadas} realocada(s) para a próxima semana.`);
        }
      } else {
        const resultado = await redistribuirPorEntrada(user.uid, user.houseId, semana.weekId, 'retorno_viagem', undefined, undefined, 'Tarefas Redistribuídas - Alteração de Viagem');
        if (resultado.redistribuidas > 0 || resultado.adiantadas > 0) {
          setSucesso(prev => `${prev} ${resultado.redistribuidas} tarefa(s) redistribuída(s).`);
        }
      }
    } catch (err: any) {
      console.error('[VIAGEM] Erro ao redistribuir:', err);
    }
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
    const viagem = viagens.find(v => v.id === id);
    try {
      await deleteDoc(doc(db, 'viagens', id));
      setSucesso('Viagem excluída!');
      carregarViagens();
      if (viagem && user?.uid && user.houseId && sobrepoeSemanaAtual(viagem.dataSaida, viagem.dataRetorno)) {
        const { inicio, fim } = getIntervaloSemana(new Date());
        const aindaViajando = await existeViagemSobrepondoPeriodo(user.uid, inicio, fim, id);
        if (!aindaViajando) {
          const semana = getSemanaDaData(new Date());
          try {
            const resultado = await redistribuirPorEntrada(user.uid, user.houseId, semana.weekId, 'retorno_viagem', undefined, undefined, 'Tarefas Redistribuídas - Viagem Excluída');
            if (resultado.redistribuidas > 0 || resultado.adiantadas > 0) {
              setSucesso(prev => `${prev} ${resultado.redistribuidas} tarefa(s) redistribuída(s).`);
            }
          } catch (err: any) { console.error('[VIAGEM] Erro ao redistribuir exclusão:', err); }
        }
      }
    }
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
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Nome de Exibição (Apelido)</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
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
                const status = v.dataRetorno < hoje ? 'Concluída' : v.dataSaida > hoje ? 'Planejáda' : 'Em andamento';
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

        {/* Verificar Atualizações */}
        {isNative && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface">Versão do App</h3>
              <span className="text-caption text-on-surface-variant">{currentVersion}</span>
            </div>
            {hasUpdate && versionInfo && (
              <div className="p-3 bg-primary-container/20 border border-primary/30 rounded-lg space-y-2">
                <p className="text-sm text-primary">
                  <span className="material-symbols-outlined text-sm align-middle">new_releases</span>{' '}
                  Nova versão {versionInfo.latestVersion} disponível!
                </p>
                <button
                  onClick={downloadUpdate}
                  className="w-full bg-primary text-on-primary font-bold py-2.5 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  Baixar Versão Mais Recente
                </button>
              </div>
            )}
            <button
              onClick={forceCheck}
              disabled={checkingVersion}
              className="w-full bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined">refresh</span>
              {checkingVersion ? 'Verificando...' : 'Verificar Atualizações'}
            </button>
          </div>
        )}
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
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Saída</label><input type="date" value={formViagem.dataSaida} onChange={e => setFormViagem({ ...formViagem, dataSaida: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
              <div><label className="text-label-sm text-on-surface-variant block mb-1">Retorno</label><input type="date" value={formViagem.dataRetorno} onChange={e => setFormViagem({ ...formViagem, dataRetorno: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" /></div>
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
