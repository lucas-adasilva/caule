import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useApp } from '@/App';
import { TopAppBar } from '@/components/TopAppBar';
import { UserAvatar } from '@/components/UserAvatar';
import { redistribuirPorSaida, redistribuirPorEntrada } from '@/utils/distribuicao';
import { getSemanaDaData, getIntervaloSemana, sobrepoeSemanaAtual } from '@/utils/semana';
import { existeViagemSobrepondoPeriodo } from '@/utils/viagens';

interface Casa { id: string; nome: string; endereco: string; cidade: string; estado: string; cep: string; createdBy: string; senhaCadastro?: string; foto?: string; }
interface Comodo { id: string; nome: string; icone: string; cor: string; tipo: 'coletivo' | 'privado'; casaId: string; ordem: number; createdBy: string; responsavelId?: string; }
interface Tarefa { id: string; titulo: string; descricao: string; comodoId: string; responsavelId: string; casaId: string; prioridade: 'alta' | 'media' | 'baixa'; frequencia: 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal'; status: 'aguardando_responsavel' | 'pendente' | 'em_andamento' | 'concluída'; tipo: 'coletiva' | 'privada'; diasSemana: string[]; diaMes: number; createdBy: string; dataUnica?: string; vezesPorSemana?: number; }
interface UserData {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'morador' | 'hospede';
  houseId: string;
  isActive: boolean;
  isPresent: boolean;
  // Campos opcionais do Firestore
  phone?: string;
  avatar?: string;
  bio?: string;
  birthDate?: string;
  emergencyContact?: string;
  room?: string;
  fullName?: string;
  pixKey?: string;
  [key: string]: any;
}
type Aba = 'casas' | 'comodos' | 'tarefas' | 'moradores' | 'distribuição' | 'notificações';

interface Atribuicao { id: string; tarefaId: string; titulo: string; descricao: string; prioridade: 'alta' | 'media' | 'baixa'; responsavelId: string; responsavelNome: string; diaSemana: number; status: 'pendente' | 'concluída'; dataConclusao?: string; execucaoId?: string; }
interface Distribuicao { id: string; weekId: string; houseId: string; atribuicoes: Atribuicao[]; }
interface TarefaBase { id: string; titulo: string; descricao: string; frequencia: string; prioridade: 'alta' | 'media' | 'baixa'; diasSemana: string[]; horarioLimite: string; houseId: string; ativo: boolean; }
interface Execucao { id: string; tarefaId: string; titulo?: string; executorId: string; executorNome?: string; weekId?: string; data: string; casaId: string; }
interface MoradorPresente { uid: string; name: string; isPresent: boolean; isActive: boolean; role?: string; estadiaInicio?: string; estadiaFim?: string; }
interface Viagem { id: string; uid: string; destino: string; dataSaida: string; dataRetorno: string; motivo: string; }

const EMOJI_SUGESTOES = ['🛋️','🍽️','🚿','🛏️','🚽','🧺','🚗','🌳','🎮','📚','🎬','🔥','🌱'];
const CORES_COMODO = ['bg-surface-variant','bg-primary/20','bg-secondary/20','bg-tertiary/20','bg-error/20'];
// Dias da semana para tarefas (usado em formulários de tarefa)
// const DIAS_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sab','Dom'];

export function ConfiguracoesPage() {
  const { user } = useAuthStore();
  const { openMenu, openNotifications } = useApp();
  const [abaAtiva, setAbaAtiva] = useState<Aba>('casas');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Casas
  const [casas, setCasas] = useState<Casa[]>([]);
  const [casaSelecionada, setCasaSelecionada] = useState<Casa | null>(null);
  const [editandoCasaId, setEditandoCasaId] = useState<string | null>(null);
  const [formCasa, setFormCasa] = useState({ nome: '', endereco: '', cidade: '', estado: '', cep: '', senhaCadastro: '', foto: '' });
  const [uploadingFotoCasa, setUploadingFotoCasa] = useState(false);
  const fileInputCasaRef = useRef<HTMLInputElement>(null);

  // Comodos
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [editandoComodoId, setEditandoComodoId] = useState<string | null>(null);
  const [formComodo, setFormComodo] = useState({ nome: '', icone: EMOJI_SUGESTOES[0], cor: CORES_COMODO[0], tipo: 'coletivo' as 'coletivo' | 'privado', responsavelId: '' });
  const [modalComodoOpen, setModalComodoOpen] = useState(false);

  // Emoji automático baseado no nome do cômodo
  function sugerirEmoji(nome: string): string {
    const lower = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map: Record<string, string> = {
      sala: '🛋️', tv: '📺', estar: '🛋️', visita: '🛋️', recepcao: '🛋️',
      cozinha: '🍽️', jantar: '🍽️', comida: '🍽️', refeitorio: '🍽️',
      banheiro: '🚿', banho: '🚿', ducha: '🚿', lavabo: '🚿', higiene: '🚿',
      quarto: '🛏️', dormitorio: '🛏️', dormir: '🛏️', suite: '🛏️', cama: '🛏️',
      toilet: '🚽', wc: '🚽', privada: '🚽', sanitario: '🚽',
      lavanderia: '🧺', lavar: '🧺', roupa: '🧺', secar: '🧺', passar: '🧺',
      garagem: '🚗', carro: '🚗', moto: '🚗', estacionamento: '🚗', vehiculo: '🚗',
      jardim: '🌳', quintal: '🌳', planta: '🌳', flor: '🌳', horta: '🌳',
      jogo: '🎮', videogame: '🎮', play: '🎮', diversao: '🎮', lazer: '🎮',
      biblioteca: '📚', livro: '🚸', leitura: '📚', estudo: '📚', escrita: '📚',
      cinema: '🎬', filme: '🎬', video: '🎬', musica: '🎬', entretenimento: '🎬',
      lareira: '🔥', aquecer: '🔥', fogo: '🔥', chimenea: '🔥', inverno: '🔥',
      vaso: '🌱', verde: '🌱', natureza: '🌱',
      escritorio: '💻', trabalho: '💻', home: '💻', office: '💻',
      closet: '👕', vestuario: '👕', guardar: '👕', armario: '👕',
      academia: '💪', fitness: '💪', exercicio: '💪', musculacao: '💪', treino: '💪',
      piscina: '🏊', agua: '💧', nadar: '🏊', hidro: '💧',
      sacada: '🌇', varanda: '🌇', terraco: '🌇', vista: '🌇', externo: '🌇',
      corredor: '🚪', hall: '🚪', entrada: '🚪', passagem: '🚪', porta: '🚪',
      deposito: '📦', guarda: '📦', estoque: '📦', ferramenta: '🔧', arrumacao: '📦',
    };
    for (const [key, emoji] of Object.entries(map)) {
      if (lower.includes(key)) return emoji;
    }
    return '🏠';
  }

  useEffect(() => {
    if (formComodo.nome.trim()) {
      const sugerido = sugerirEmoji(formComodo.nome);
      setFormComodo(prev => prev.icone === sugerido ? prev : { ...prev, icone: sugerido });
    }
  }, [formComodo.nome]);

  useEffect(() => {
    if (formComodo.tipo === 'coletivo') {
      setFormComodo(prev => ({ ...prev, responsavelId: '' }));
    }
  }, [formComodo.tipo]);

  // Tarefas
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [editandoTarefaId, setEditandoTarefaId] = useState<string | null>(null);
  const [formTarefa, setFormTarefa] = useState({ titulo: '', descricao: '', prioridade: 'media' as 'alta' | 'media' | 'baixa', frequencia: 'semanal' as Tarefa['frequencia'], tipo: 'coletiva' as 'coletiva' | 'privada', diasSemana: [] as string[], horarioLimite: '', diaMes: 1, comodoId: '', dataUnica: '', vezesPorSemana: 1 });
  // Form completo de edicao de morador
  const [editandoMoradorId, setEditandoMoradorId] = useState<string | null>(null);
  const [formMoradorCompleto, setFormMoradorCompleto] = useState<Record<string, any>>({});
  // Viagens dos moradores para badge de ausente
  const [moradorViagens, setMoradorViagens] = useState<Record<string, boolean>>({});
  // CRUD de viagens no modal de edicao
  const [viagensMoradorEditando, setViagensMoradorEditando] = useState<Viagem[]>([]);
  const [novaViagem, setNovaViagem] = useState({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });
  const [editandoViagemId, setEditandoViagemId] = useState<string | null>(null);

  const DIAS_SEMANA = [
    { key: '0', label: 'Seg', cod: 'seg' },
    { key: '1', label: 'Ter', cod: 'ter' },
    { key: '2', label: 'Qua', cod: 'qua' },
    { key: '3', label: 'Qui', cod: 'qui' },
    { key: '4', label: 'Sex', cod: 'sex' },
    { key: '5', label: 'Sab', cod: 'sab' },
    { key: '6', label: 'Dom', cod: 'dom' },
  ];
  // Mapa: seg=0, ter=1, qua=2, qui=3, sex=4, sab=5, dom=6 (Segunda como dia 0)
  function parseDiaSemana(d: string): number | null {
    const map: Record<string, number> = {
      '0': 0, 'seg': 0, 'segunda': 0,
      '1': 1, 'ter': 1, 'terca': 1, 'terça': 1,
      '2': 2, 'qua': 2, 'quarta': 2,
      '3': 3, 'qui': 3, 'quinta': 3,
      '4': 4, 'sex': 4, 'sexta': 4,
      '5': 5, 'sab': 5, 'sabado': 5, 'sábado': 5,
      '6': 6, 'dom': 6, 'domingo': 6,
    };
    const num = map[d?.toLowerCase()?.trim()];
    return num !== undefined ? num : null;
  }

  // Moradores
  const [moradores, setMoradores] = useState<UserData[]>([]);

  // Distribuicao
  const [distribuicao, setDistribuicao] = useState<Distribuicao | null>(null);
  const [distLoading, setDistLoading] = useState(false);
  const [semanaSelecionada, setSemanaSelecionada] = useState(getSemanaAtual());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [considerarDomingo, setConsiderarDomingo] = useState(false);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // Verifica se um morador está viajando durante uma semana específica
  function moradorViajandoNaSemana(uid: string, weekId: string): { viajando: boolean; diasFora: number[] } {
    const match = weekId.match(/(\d+)-W(\d+)/);
    if (!match) return { viajando: false, diasFora: [] };
    const ano = parseInt(match[1], 10);
    const semana = parseInt(match[2], 10);
    // Primeiro dia da semana (segunda)
    const jan4 = new Date(ano, 0, 4);
    const primeiroSegunda = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
    const inicioSemana = new Date(primeiroSegunda.getTime() + (semana - 1) * 7 * 24 * 60 * 60 * 1000);
    const fimSemana = new Date(inicioSemana.getTime() + 6 * 24 * 60 * 60 * 1000);
    const inicioStr = inicioSemana.toISOString().split('T')[0];
    const fimStr = fimSemana.toISOString().split('T')[0];

    const diasFora: number[] = [];
    viagens.filter(v => v.uid === uid).forEach(v => {
      // Verifica se a viagem sobrepõe a semana
      if (v.dataSaida <= fimStr && v.dataRetorno >= inicioStr) {
        for (let d = 0; d < 7; d++) {
          const diaSemana = new Date(inicioSemana.getTime() + d * 24 * 60 * 60 * 1000);
          const diaStr = diaSemana.toISOString().split('T')[0];
          if (diaStr >= v.dataSaida && diaStr <= v.dataRetorno) {
            diasFora.push(d);
          }
        }
      }
    });
    return { viajando: diasFora.length > 0, diasFora: [...new Set(diasFora)].filter(d => considerarDomingo || d !== 6).sort() };
  }
  const [tarefasBase, setTarefasBase] = useState<TarefaBase[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [moradoresPresentes, setMoradoresPresentes] = useState<MoradorPresente[]>([]);

  // Notificações
  const [notifToken, setNotifToken] = useState('');
  const [notifPerm, setNotifPerm] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [testTitle, setTestTitle] = useState('');
  const [testBody, setTestBody] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);

  function getSemanaAtual(semanaOffset = 0): string {
    const hoje = new Date();
    hoje.setDate(hoje.getDate() + semanaOffset * 7);
    const ano = hoje.getFullYear();
    const primeiraSegunda = new Date(ano, 0, 1);
    const diasDesdeInicio = Math.floor((hoje.getTime() - primeiraSegunda.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((diasDesdeInicio + primeiraSegunda.getDay()) / 7);
    return `${ano}-W${String(semana).padStart(2, '0')}`;
  }

  function getSemanasDoMes(ano: number, mes: number): { weekId: string; num: number; label: string; inicio: string; fim: string }[] {
    const semanas: { weekId: string; num: number; label: string; inicio: string; fim: string }[] = [];
    const primeiroDiaMes = new Date(ano, mes, 1);
    const ultimoDiaMes = new Date(ano, mes + 1, 0);
    // Encontrar a primeira segunda do mes ou anterior
    const primeiraSegunda = new Date(primeiroDiaMes);
    const diaSemana = primeiroDiaMes.getDay();
    primeiraSegunda.setDate(primeiroDiaMes.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
    // Calcular numero da semana ISO
    const jan4 = new Date(ano, 0, 4);
    const jan4Dia = jan4.getDay();
    const jan4Segunda = new Date(ano, 0, 4 - (jan4Dia === 0 ? 6 : jan4Dia - 1));
    let semanaAtual = new Date(primeiraSegunda);
    while (semanaAtual <= ultimoDiaMes || semanas.length < 1) {
      const fimSemana = new Date(semanaAtual);
      fimSemana.setDate(fimSemana.getDate() + 6);
      const diasDiff = Math.floor((semanaAtual.getTime() - jan4Segunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const numSemana = diasDiff + 1;
      const temDiaNoMes = semanaAtual <= ultimoDiaMes && fimSemana >= primeiroDiaMes;
      if (temDiaNoMes || semanas.length === 0) {
        const inicioStr = `${String(semanaAtual.getDate()).padStart(2, '0')}/${String(semanaAtual.getMonth() + 1).padStart(2, '0')}`;
        const fimStr = `${String(fimSemana.getDate()).padStart(2, '0')}/${String(fimSemana.getMonth() + 1).padStart(2, '0')}`;
        semanas.push({ weekId: `${ano}-W${String(numSemana).padStart(2, '0')}`, num: numSemana, label: `S${numSemana}`, inicio: inicioStr, fim: fimStr });
      }
      if (semanaAtual > ultimoDiaMes && semanas.length > 0) break;
      semanaAtual.setDate(semanaAtual.getDate() + 7);
    }
    return semanas;
  }

  function getSemanaDoMes(weekId: string): number {
    const match = weekId.match(/(\d+)-W(\d+)/);
    if (!match) return 1;
    const ano = parseInt(match[1], 10);
    const semanaISO = parseInt(match[2], 10);
    // Primeira semana ISO do ano
    const jan4 = new Date(ano, 0, 4);
    const jan4Dia = jan4.getDay();
    const jan4Segunda = new Date(ano, 0, 4 - (jan4Dia === 0 ? 6 : jan4Dia - 1));
    const inicioSemana = new Date(jan4Segunda.getTime() + (semanaISO - 1) * 7 * 24 * 60 * 60 * 1000);
    // Semana do mês baseada na data de início da semana ISO
    const mes = inicioSemana.getMonth();
    const primeiroDiaMes = new Date(ano, mes, 1);
    const diaSemana = primeiroDiaMes.getDay();
    const primeiraSegunda = new Date(primeiroDiaMes.getTime() - (diaSemana === 0 ? 6 : diaSemana - 1) * 24 * 60 * 60 * 1000);
    const diasDiff = Math.floor((inicioSemana.getTime() - primeiraSegunda.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return diasDiff + 1;
  }

  useEffect(() => { if (user?.uid) { carregarCasas(); } }, [user?.uid]);
  useEffect(() => { if (casaSelecionada?.id) { carregarComodos(); carregarTarefas(); carregarMoradores(); } }, [casaSelecionada?.id]);
  useEffect(() => { if (abaAtiva === 'distribuição' && casaSelecionada?.id) { carregarDadosDistribuicao(); } }, [abaAtiva, casaSelecionada?.id, semanaSelecionada]);
  useEffect(() => { if (abaAtiva === 'moradores' && moradores.length > 0) { carregarViagensMoradores(); } }, [abaAtiva, moradores]);

  async function carregarCasas() {
    try {
      const q = query(collection(db, 'casas'), orderBy('nome'));
      const snap = await getDocs(q);
      const data: Casa[] = [];
      snap.forEach(d => { const ddata = d.data() as Omit<Casa, 'id'>; data.push({ id: d.id, ...ddata }); });
      setCasas(data);
      if (data.length > 0 && !casaSelecionada) setCasaSelecionada(data[0]);
    } catch (e: any) { setErro('Erro ao carregar casas: ' + e.message); }
  }

  async function handleSalvarCasa() {
    if (!formCasa.nome.trim()) { setErro('Nome obrigatório'); return; }
    try {
      if (editandoCasaId) {
        await updateDoc(doc(db, 'casas', editandoCasaId), { ...formCasa, updatedAt: serverTimestamp() });
        setSucesso('Casa atualizada!');
        setEditandoCasaId(null);
        setFormCasa({ nome: '', endereco: '', cidade: '', estado: '', cep: '', senhaCadastro: '', foto: '' });
        carregarCasas();
      } else {
        const docRef = await addDoc(collection(db, 'casas'), { ...formCasa, createdBy: user?.uid, createdAt: serverTimestamp() });
        setSucesso('Casa criada! Agora você pode adicionar uma foto.');
        // Entra em modo de edição da casa recém-criada para permitir upload de foto
        setEditandoCasaId(docRef.id);
        setFormCasa({ ...formCasa, foto: '' });
        carregarCasas();
      }
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  function triggerFotoCasaUpload() {
    fileInputCasaRef.current?.click();
  }

  async function handleFotoCasaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editandoCasaId) return;
    if (!file.type.startsWith('image/')) {
      setErro('Selecione uma imagem válida');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 4MB');
      return;
    }
    setUploadingFotoCasa(true);
    setErro('');
    try {
      const storageRef = ref(storage, `casas/${editandoCasaId}/foto.jpg`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'casas', editandoCasaId), { foto: downloadURL, updatedAt: serverTimestamp() });
      setFormCasa(prev => ({ ...prev, foto: downloadURL }));
      setSucesso('Foto da casa atualizada!');
      carregarCasas();
    } catch (error: any) {
      console.error('Erro ao fazer upload da foto da casa:', error);
      setErro('Erro ao enviar foto: ' + error.message);
    } finally {
      setUploadingFotoCasa(false);
      if (fileInputCasaRef.current) fileInputCasaRef.current.value = '';
    }
  }

  async function handleExcluirCasa(id: string) {
    if (!confirm('Ao excluir esta casa, os cômodos, tarefas e distribuições vinculados a ela permanecerão no sistema, mas não ficarão mais visíveis.\n\nTem certeza que desejá excluir?')) return;
    try { await deleteDoc(doc(db, 'casas', id)); setSucesso('Casa excluída!'); carregarCasas(); if (casaSelecionada?.id === id) setCasaSelecionada(null); }
    catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function carregarComodos() {
    if (!casaSelecionada?.id) return;
    try {
      const q = query(collection(db, 'comodos'), where('casaId', '==', casaSelecionada.id));
      const snap = await getDocs(q);
      const data: Comodo[] = [];
      snap.forEach(d => { const ddata = d.data() as Omit<Comodo, 'id'>; data.push({ id: d.id, ...ddata }); });
      data.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      setComodos(data);
    } catch (e: any) { setErro('Erro ao carregar cômodos: ' + e.message); }
  }

  async function handleSalvarComodo() {
    if (!formComodo.nome.trim() || !casaSelecionada?.id) { setErro('Preencha todos os campos'); return; }
    if (formComodo.tipo === 'privado' && !formComodo.responsavelId) { setErro('Selecione um morador para o cômodo privado'); return; }
    try {
      if (editandoComodoId) {
        await updateDoc(doc(db, 'comodos', editandoComodoId), { ...formComodo, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'comodos'), { ...formComodo, casaId: casaSelecionada.id, ordem: comodos.length, createdBy: user?.uid, createdAt: serverTimestamp() });
      }
      setFormComodo({ nome: '', icone: EMOJI_SUGESTOES[0], cor: CORES_COMODO[0], tipo: 'coletivo', responsavelId: '' });
      setEditandoComodoId(null);
      setModalComodoOpen(false);
      setSucesso('Cômodo salvo!');
      carregarComodos();
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  function abrirModalNovoComodo() {
    setEditandoComodoId(null);
    setFormComodo({ nome: '', icone: EMOJI_SUGESTOES[0], cor: CORES_COMODO[0], tipo: 'coletivo', responsavelId: '' });
    setErro('');
    setSucesso('');
    setModalComodoOpen(true);
  }

  function abrirModalEditarComodo(c: Comodo) {
    setEditandoComodoId(c.id);
    setFormComodo({ nome: c.nome, icone: c.icone, cor: c.cor, tipo: c.tipo, responsavelId: c.responsavelId || '' });
    setErro('');
    setSucesso('');
    setModalComodoOpen(true);
  }

  function fecharModalComodo() {
    setModalComodoOpen(false);
    setEditandoComodoId(null);
    setFormComodo({ nome: '', icone: EMOJI_SUGESTOES[0], cor: CORES_COMODO[0], tipo: 'coletivo', responsavelId: '' });
    setErro('');
    setSucesso('');
  }

  async function handleExcluirComodo(id: string) {
    if (!confirm('Excluir este cômodo?')) return;
    try { await deleteDoc(doc(db, 'comodos', id)); setSucesso('Cômodo excluído!'); carregarComodos(); }
    catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function carregarTarefas() {
    if (!casaSelecionada?.id) return;
    try {
      const q = query(collection(db, 'tarefas'), where('casaId', '==', casaSelecionada.id));
      const snap = await getDocs(q);
      const data: Tarefa[] = [];
      snap.forEach(d => { const ddata = d.data() as Omit<Tarefa, 'id'>; data.push({ id: d.id, ...ddata }); });
      data.sort((a, b) => a.titulo.localeCompare(b.titulo));
      setTarefas(data);
    } catch (e: any) { setErro('Erro ao carregar tarefas: ' + e.message); }
  }

  async function handleSalvarTarefa() {
    if (!formTarefa.titulo.trim() || !casaSelecionada?.id) { setErro('Preencha todos os campos'); return; }
    if (formTarefa.frequencia === 'unica' && !formTarefa.dataUnica) { setErro('Selecione a data para tarefa única'); return; }
    if (['semanal','quinzenal'].includes(formTarefa.frequencia) && formTarefa.prioridade === 'alta' && formTarefa.diasSemana.length === 0) { setErro('Selecione pelo menos um dia da semana para tarefa de alta prioridade'); return; }
    if (formTarefa.frequencia === 'mensal' && formTarefa.prioridade === 'alta' && !formTarefa.diaMes) { setErro('Selecione o dia do mês para tarefa de alta prioridade'); return; }
    try {
      const data = {
        titulo: formTarefa.titulo,
        descricao: formTarefa.descricao,
        prioridade: formTarefa.prioridade,
        frequencia: formTarefa.frequencia,
        tipo: formTarefa.tipo,
        horarioLimite: formTarefa.horarioLimite || '',
        diaMes: formTarefa.diaMes ?? 1,
        comodoId: formTarefa.comodoId || comodos[0]?.id || '',
        dataUnica: formTarefa.dataUnica || '',
        vezesPorSemana: formTarefa.vezesPorSemana ?? 1,
        casaId: casaSelecionada.id,
        status: 'aguardando_responsavel' as const,
        responsavelId: '',
        createdBy: user?.uid,
        diasSemana: formTarefa.diasSemana,
      };
      if (editandoTarefaId) {
        await updateDoc(doc(db, 'tarefas', editandoTarefaId), { ...data, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'tarefas'), { ...data, createdAt: serverTimestamp() });
      }
      setFormTarefa({ titulo: '', descricao: '', prioridade: 'media', frequencia: 'semanal', tipo: 'coletiva', diasSemana: [], horarioLimite: '', diaMes: 1, comodoId: '', dataUnica: '', vezesPorSemana: 1 });
      setEditandoTarefaId(null);
      setModalTarefaOpen(false);
      setSucesso('Tarefa salva!');
      carregarTarefas();
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  const [modalTarefaOpen, setModalTarefaOpen] = useState(false);

  function abrirModalNovaTarefa() {
    setEditandoTarefaId(null);
    setFormTarefa({ titulo: '', descricao: '', prioridade: 'media', frequencia: 'semanal', tipo: 'coletiva', diasSemana: [], horarioLimite: '', diaMes: 1, comodoId: '', dataUnica: '', vezesPorSemana: 1 });
    setErro('');
    setSucesso('');
    setModalTarefaOpen(true);
  }

  function abrirModalEditarTarefa(t: Tarefa) {
    setEditandoTarefaId(t.id);
    setFormTarefa({ titulo: t.titulo, descricao: t.descricao, prioridade: t.prioridade, frequencia: t.frequencia, tipo: t.tipo, diasSemana: t.diasSemana || [], horarioLimite: (t as any).horarioLimite || '', diaMes: t.diaMes ?? 1, comodoId: t.comodoId, dataUnica: t.dataUnica || '', vezesPorSemana: t.vezesPorSemana ?? 1 });
    setErro('');
    setSucesso('');
    setModalTarefaOpen(true);
  }

  function fecharModalTarefa() {
    setModalTarefaOpen(false);
    setEditandoTarefaId(null);
    setFormTarefa({ titulo: '', descricao: '', prioridade: 'media', frequencia: 'semanal', tipo: 'coletiva', diasSemana: [], horarioLimite: '', diaMes: 1, comodoId: '', dataUnica: '', vezesPorSemana: 1 });
    setErro('');
    setSucesso('');
  }

  async function handleExcluirTarefa(id: string) {
    if (!confirm('Excluir esta tarefa?')) return;
    try { await deleteDoc(doc(db, 'tarefas', id)); setSucesso('Tarefa excluída!'); carregarTarefas(); }
    catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function handleDuplicarTarefa(t: Tarefa) {
    try {
      const dados = {
        titulo: t.titulo + ' (Cópia)',
        descricao: t.descricao,
        prioridade: t.prioridade,
        frequencia: t.frequencia,
        tipo: t.tipo,
        diasSemana: t.diasSemana || [],
        horarioLimite: (t as any).horarioLimite || '',
        diaMes: t.diaMes ?? 1,
        comodoId: t.comodoId,
        dataUnica: t.dataUnica || '',
        vezesPorSemana: (t as any).vezesPorSemana ?? 1,
        casaId: t.casaId,
        status: 'aguardando_responsavel' as const,
        responsavelId: '',
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'tarefas'), dados);
      setSucesso('Tarefa duplicada!');
      carregarTarefas();
    } catch (e: any) { setErro('Erro ao duplicar: ' + e.message); }
  }

  async function carregarMoradores() {
    if (!casaSelecionada?.id) return;
    try {
      const q = query(collection(db, 'users'), where('houseId', '==', casaSelecionada.id));
      const snap = await getDocs(q);
      const data: UserData[] = [];
      snap.forEach(d => { const udata = d.data() as Omit<UserData, 'uid'>; if (udata.isActive !== false) data.push({ uid: d.id, ...udata } as UserData); });
      data.sort((a, b) => a.name.localeCompare(b.name));
      setMoradores(data);
    } catch (e: any) { setErro('Erro ao carregar moradores: ' + e.message); }
  }

  // Toggle rapido de isPresent (na lista, sem abrir edicao)
  async function toggleMoradorPresente(morador: UserData) {
    try {
      const novoValor = !morador.isPresent;
      await updateDoc(doc(db, 'users', morador.uid), { isPresent: novoValor, updatedAt: serverTimestamp() });
      // Atualiza localmente sem recarregar tudo
      setMoradores(prev => prev.map(m => m.uid === morador.uid ? { ...m, isPresent: novoValor } : m));
      setSucesso(`${morador.name} agora esta ${novoValor ? 'presente' : 'ausente'}`);
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  // Abre edicao completa com todos os campos do Firestore
  function abrirEdicaoMoradorCompleto(morador: UserData) {
    setEditandoMoradorId(morador.uid);
    setFormMoradorCompleto({
      name: morador.name || '',
      email: morador.email || '',
      role: morador.role || 'hospede',
      phone: morador.phone || '',
      bio: morador.bio || '',
      birthDate: morador.birthDate || '',
      emergencyContact: morador.emergencyContact || '',
      room: morador.room || '',
      avatar: morador.avatar || '',
      estadiaInicio: morador.estadiaInicio || '',
      estadiaFim: morador.estadiaFim || '',
      pixKey: morador.pixKey || '',
    });
    setViagensMoradorEditando([]);
    setNovaViagem({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });
    setEditandoViagemId(null);
    carregarViagensMorador(morador.uid);
  }

  async function handleSalvarMoradorCompleto() {
    if (!editandoMoradorId) return;
    try {
      // Remove campos vazios para nao sobrescrever com string vazia
      const dadosParaSalvar: Record<string, any> = { updatedAt: serverTimestamp() };
      Object.entries(formMoradorCompleto).forEach(([key, value]) => {
        if (value !== '' && value !== undefined) {
          dadosParaSalvar[key] = value;
        }
      });
      // Se for hospede, sincroniza isPresent (hoje) e verifica mudanca de presenca NA SEMANA ATUAL
      const role = dadosParaSalvar.role || formMoradorCompleto.role || 'hospede';
      let sobrepoeAntes = false;
      let sobrepoeDepois = false;
      let isCadastro = false;
      let novaEstadiaInicio = '';
      let novaEstadiaFim = '';
      if (role === 'hospede') {
        novaEstadiaInicio = dadosParaSalvar.estadiaInicio || formMoradorCompleto.estadiaInicio || '';
        novaEstadiaFim = dadosParaSalvar.estadiaFim || formMoradorCompleto.estadiaFim || '';
        const hoje = new Date().toISOString().split('T')[0];
        dadosParaSalvar.isPresent = !!(novaEstadiaInicio && novaEstadiaFim && novaEstadiaInicio <= hoje && novaEstadiaFim > hoje);
        const moradorAnterior = moradores.find(m => m.uid === editandoMoradorId);
        const prevInicio = moradorAnterior?.estadiaInicio || '';
        const prevFim = moradorAnterior?.estadiaFim || '';
        isCadastro = !prevInicio || !prevFim;
        sobrepoeAntes = sobrepoeSemanaAtual(prevInicio, prevFim);
        sobrepoeDepois = sobrepoeSemanaAtual(novaEstadiaInicio, novaEstadiaFim);
      }
      await updateDoc(doc(db, 'users', editandoMoradorId), dadosParaSalvar);
      setEditandoMoradorId(null);
      setFormMoradorCompleto({});
      setSucesso('Morador atualizado!');
      carregarMoradores();
      // Se a presenca do hospede NA SEMANA ATUAL mudou, dispara redistribuição
      if (role === 'hospede' && casaSelecionada?.id && sobrepoeAntes !== sobrepoeDepois) {
        const semanaAtual = getSemanaDaData(new Date());
        try {
          if (sobrepoeDepois) {
            const titulo = isCadastro ? 'Tarefas Redistribuídas - Cadastro de Hospedagem' : 'Tarefas Redistribuídas - Alteração de Hospedagem';
            const resultado = await redistribuirPorEntrada(
              editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'estadia_iniciada',
              novaEstadiaInicio, novaEstadiaFim, titulo
            );
            setSucesso(`Hóspede presente! ${resultado.redistribuidas} tarefas redistribuídas${resultado.adiantadas > 0 ? `, ${resultado.adiantadas} adiantadas` : ''}.`);
          } else {
            const resultado = await redistribuirPorSaida(editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'estadia_terminada', 'Tarefas Redistribuídas - Alteração de Hospedagem');
            setSucesso(`Hóspede ausente. ${resultado.redistribuidas} tarefas redistribuídas, ${resultado.realocadas} realocadas.`);
          }
        } catch (err: any) {
          console.error('Erro ao redistribuir por mudança de estadia:', err);
        }
      }
    } catch (e: any) { setErro('Erro ao salvar: ' + e.message); }
  }

  async function handleExcluirEstadiaMorador() {
    if (!editandoMoradorId) return;
    if (!confirm('Excluir a estadia deste hóspede? Ele perderá acesso às tarefas até um novo período ser definido.')) return;
    try {
      const moradorAtual = moradores.find(m => m.uid === editandoMoradorId);
      const sobrepoeAntes = sobrepoeSemanaAtual(moradorAtual?.estadiaInicio, moradorAtual?.estadiaFim);
      await updateDoc(doc(db, 'users', editandoMoradorId), {
        estadiaInicio: '',
        estadiaFim: '',
        isPresent: false,
        updatedAt: serverTimestamp(),
      });
      setFormMoradorCompleto(prev => ({ ...prev, estadiaInicio: '', estadiaFim: '' }));
      setSucesso('Estadia excluída!');
      carregarMoradores();
      if (casaSelecionada?.id && sobrepoeAntes) {
        const semanaAtual = getSemanaDaData(new Date());
        try {
          const resultado = await redistribuirPorSaida(editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'estadia_terminada', 'Tarefas Redistribuídas - Hospedagem Excluída');
          setSucesso(`Estadia excluída! ${resultado.redistribuidas} tarefas redistribuídas, ${resultado.realocadas} realocadas.`);
        } catch (err: any) { console.error('Erro ao redistribuir exclusão de estadia:', err); }
      }
    } catch (e: any) { setErro('Erro ao excluir estadia: ' + e.message); }
  }

  async function handleExcluirMorador(morador: UserData) {
    if (!confirm('Tem certeza que desejá excluir ' + morador.name + '? Esta ação não pode ser desfeita.')) return;
    try {
      // Soft delete - desativa o usuario e remove da casa (evita permissao de deleteDoc no doc de outro user)
      await updateDoc(doc(db, 'users', morador.uid), {
        isActive: false,
        houseId: '',
        updatedAt: serverTimestamp(),
      });
      setMoradores(prev => prev.filter(m => m.uid !== morador.uid));
      setSucesso(morador.name + ' excluído');
    } catch (e: any) { setErro('Erro ao excluir: ' + e.message); }
  }

  async function carregarViagensMoradores() {
    if (!casaSelecionada?.id || moradores.length === 0) return;
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const map: Record<string, boolean> = {};
      for (let i = 0; i < moradores.length; i += 10) {
        const batch = moradores.slice(i, i + 10).map(m => m.uid);
        const q = query(collection(db, 'viagens'), where('uid', 'in', batch));
        const snap = await getDocs(q);
        snap.forEach(d => {
          const v = d.data() as Omit<Viagem, 'id'>;
          if (v.dataSaida <= hoje && v.dataRetorno >= hoje) {
            map[v.uid] = true;
          }
        });
      }
      setMoradorViagens(map);
    } catch (e: any) { /* silencioso */ }
  }

  async function carregarViagensMorador(uid: string) {
    try {
      const q = query(collection(db, 'viagens'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const data: Viagem[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as Viagem));
      data.sort((a, b) => a.dataSaida.localeCompare(b.dataSaida));
      setViagensMoradorEditando(data);
    } catch (e: any) { setErro('Erro ao carregar viagens: ' + e.message); }
  }

  async function salvarViagem() {
    if (!editandoMoradorId) return;
    if (!novaViagem.destino.trim() || !novaViagem.dataSaida || !novaViagem.dataRetorno) { setErro('Preencha destino, data de saída e retorno'); return; }
    if (novaViagem.dataSaida > novaViagem.dataRetorno) { setErro('Data de retorno deve ser após a data de saída'); return; }
    try {
      const isCadastro = !editandoViagemId;
      const viagemOriginal = editandoViagemId ? viagensMoradorEditando.find(v => v.id === editandoViagemId) : null;
      if (editandoViagemId) {
        await updateDoc(doc(db, 'viagens', editandoViagemId), { ...novaViagem, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'viagens'), { ...novaViagem, uid: editandoMoradorId, createdAt: serverTimestamp() });
      }
      setNovaViagem({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' });
      setEditandoViagemId(null);
      setSucesso('Viagem salva!');
      await carregarViagensMorador(editandoMoradorId);
      await carregarViagensMoradores();
      // Redistribui se a presença na semana atual mudou (viagem passou a cobrir a semana ou deixou de cobrir)
      if (casaSelecionada?.id) {
        const sobrepoeAntes = viagemOriginal ? sobrepoeSemanaAtual(viagemOriginal.dataSaida, viagemOriginal.dataRetorno) : false;
        const sobrepoeDepois = sobrepoeSemanaAtual(novaViagem.dataSaida, novaViagem.dataRetorno);
        if (sobrepoeAntes !== sobrepoeDepois) {
          const semanaAtual = getSemanaDaData(new Date());
          try {
            if (sobrepoeDepois) {
              const titulo = isCadastro ? 'Tarefas Redistribuídas - Cadastro de Viagem' : 'Tarefas Redistribuídas - Alteração de Viagem';
              const resultado = await redistribuirPorSaida(editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'viagem', titulo);
              if (resultado.redistribuidas > 0 || resultado.realocadas > 0) {
                setSucesso(`Viagem salva! ${resultado.redistribuidas} tarefas redistribuídas, ${resultado.realocadas} realocadas para próxima semana.`);
              }
            } else {
              const resultado = await redistribuirPorEntrada(editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'retorno_viagem', undefined, undefined, 'Tarefas Redistribuídas - Alteração de Viagem');
              if (resultado.redistribuidas > 0 || resultado.adiantadas > 0) {
                setSucesso(`Viagem salva! ${resultado.redistribuidas} tarefas redistribuídas.`);
              }
            }
          } catch (err: any) {
            console.error('Erro ao redistribuir por viagem:', err);
          }
        }
      }
    } catch (e: any) { setErro('Erro ao salvar viagem: ' + e.message); }
  }

  async function excluirViagem(viagemId: string) {
    if (!confirm('Excluir esta viagem?')) return;
    const viagem = viagensMoradorEditando.find(v => v.id === viagemId);
    try {
      await deleteDoc(doc(db, 'viagens', viagemId));
      setViagensMoradorEditando(prev => prev.filter(v => v.id !== viagemId));
      setSucesso('Viagem excluída!');
      await carregarViagensMoradores();
      if (viagem && editandoMoradorId && casaSelecionada?.id && sobrepoeSemanaAtual(viagem.dataSaida, viagem.dataRetorno)) {
        const { inicio, fim } = getIntervaloSemana(new Date());
        const aindaViajando = await existeViagemSobrepondoPeriodo(editandoMoradorId, inicio, fim, viagemId);
        if (!aindaViajando) {
          const semanaAtual = getSemanaDaData(new Date());
          try {
            const resultado = await redistribuirPorEntrada(editandoMoradorId, casaSelecionada.id, semanaAtual.weekId, 'retorno_viagem', undefined, undefined, 'Tarefas Redistribuídas - Viagem Excluída');
            if (resultado.redistribuidas > 0 || resultado.adiantadas > 0) {
              setSucesso(`Viagem excluída! ${resultado.redistribuidas} tarefas redistribuídas.`);
            }
          } catch (err: any) { console.error('Erro ao redistribuir exclusão de viagem:', err); }
        }
      }
    } catch (e: any) { setErro('Erro ao excluir viagem: ' + e.message); }
  }

  async function carregarDadosDistribuicao() {
    if (!casaSelecionada?.id) return;
    setDistLoading(true);
    setErro('');
    try {
      const casaId = casaSelecionada.id;
      // Tarefas base - busca por casaId
      const q1 = query(collection(db, 'tarefas'), where('casaId', '==', casaId));
      const s1 = await getDocs(q1);
      const tb: TarefaBase[] = [];
      s1.forEach(d => { const data = d.data() as Omit<TarefaBase, 'id'>; tb.push({ id: d.id, ...data }); });
      setTarefasBase(tb);
      // Execucoes
      const q2 = query(collection(db, 'execucoes'), where('casaId', '==', casaId));
      const s2 = await getDocs(q2);
      const ex: Execucao[] = []; s2.forEach(d => ex.push({ id: d.id, ...d.data() } as Execucao));
      setExecucoes(ex);
      // Moradores - busca por casaId, filtra PRESENTES, ativos e hospedes dentro da estadia
      const q3 = query(collection(db, 'users'), where('houseId', '==', casaId));
      const s3 = await getDocs(q3);
      const mp: MoradorPresente[] = [];
      const uidsMoradores: string[] = [];
      const hoje = new Date().toISOString().split('T')[0];
      s3.forEach(d => {
        const data = d.data() as Omit<MoradorPresente, 'uid'>;
        if (data.isActive !== false && data.isPresent === true) {
          // Se for hospede, verifica se esta dentro do periodo de estadia
          if (data.role === 'hospede') {
            const estadiaAtiva = data.estadiaInicio && data.estadiaFim && data.estadiaInicio <= hoje && data.estadiaFim > hoje;
            if (!estadiaAtiva) return; // pula hospede fora da estadia
          }
          mp.push({ uid: d.id, ...data });
          uidsMoradores.push(d.id);
        }
      });
      setMoradoresPresentes(mp);
      // Viagens dos moradores da casa
      const viagensData: Viagem[] = [];
      if (uidsMoradores.length > 0) {
        for (let i = 0; i < uidsMoradores.length; i += 10) {
          const batch = uidsMoradores.slice(i, i + 10);
          const qv = query(collection(db, 'viagens'), where('uid', 'in', batch));
          const sv = await getDocs(qv);
          sv.forEach(d => viagensData.push({ id: d.id, ...d.data() } as Viagem));
        }
      }
      setViagens(viagensData);
      // Distribuicao da semana - busca por casaId, filtra semana no cliente
      const q4 = query(collection(db, 'distribuicoes'), where('casaId', '==', casaId));
      const s4 = await getDocs(q4);
      let encontrou = false;
      s4.forEach(d => { const data = d.data() as Omit<Distribuicao, 'id'>; if (data.weekId === semanaSelecionada && !encontrou) { encontrou = true; setDistribuicao({ id: d.id, ...data }); } });
      if (!encontrou) setDistribuicao(null);
    } catch (e: any) { setErro('Erro ao carregar distribuição: ' + e.message); }
    setDistLoading(false);
  }

  async function gerarTarefasSemana() {
    if (!casaSelecionada?.id) { setErro('Selecione uma casa'); return; }
    if (moradoresPresentes.length === 0) { setErro('Nenhum morador presente nesta casa. Verifique a aba Moradores.'); return; }
    if (tarefasBase.length === 0) { setErro('Nenhuma tarefa cadastrada. Cadastre tarefas na aba Tarefas primeiro.'); return; }
    setDistLoading(true); setErro(''); setSucesso('');
    try {
      const casaId = casaSelecionada.id;
      const atribuicoes: Atribuicao[] = [];
      const tarefasPorMorador: Record<string, number> = {};
      moradoresPresentes.forEach(m => tarefasPorMorador[m.uid] = 0);
      const tarefasExpandidas: { tarefa: TarefaBase; dia: number }[] = [];
      // Determina se semana atual eh par ou impar para quinzenais
      const matchWeek = semanaSelecionada.match(/-W(\d+)$/);
      const numSemana = matchWeek ? parseInt(matchWeek[1], 10) : 0;
      const semanaPar = numSemana % 2 === 0;

      tarefasBase.forEach(tarefa => {
        const diasUteis = considerarDomingo ? 7 : 6; // 7 = domingo a sábado, 6 = segunda a sábado
        if (tarefa.frequencia === 'diaria') { for (let d = 0; d < diasUteis; d++) tarefasExpandidas.push({ tarefa, dia: d }); }
        else if (tarefa.frequencia === 'semanal' && tarefa.diasSemana?.length > 0) {
          // Deduplica dias da semana para evitar alocacao duplicada
          const diasUnicos = [...new Set(tarefa.diasSemana.map(d => parseDiaSemana(d)).filter(d => d !== null))].filter(d => considerarDomingo || d !== 6); // Filtra domingo se nao considerar
          diasUnicos.forEach(d => { tarefasExpandidas.push({ tarefa, dia: d }); });
        }
        else if (tarefa.frequencia === 'semanal') { const vezes = (tarefa as any).vezesPorSemana || 1; for (let v = 0; v < vezes; v++) tarefasExpandidas.push({ tarefa, dia: 0 }); } // N vezes, algoritmo distribui
        else if (tarefa.frequencia === 'quinzenal') { if (!semanaPar) tarefasExpandidas.push({ tarefa, dia: 0 }); } // Apenas semanas impares (1a, 3a, 5a...)
        else if (tarefa.frequencia === 'mensal') { const semanaMes = getSemanaDoMes(semanaSelecionada); if (semanaMes === 1) tarefasExpandidas.push({ tarefa, dia: 0 }); } // Apenas 1a semana do mes
        else if (tarefa.frequencia === 'unica') { tarefasExpandidas.push({ tarefa, dia: (new Date().getDay() + 6) % 7 }); }
      });
      // Ordenar tarefas por prioridade: alta > diaria > semanal > quinzenal > mensal > unica
      const prioridadeFrequencia: Record<string, number> = { alta: 0, diaria: 1, semanal: 2, quinzenal: 3, mensal: 4, unica: 5 };
      tarefasExpandidas.sort((a, b) => {
        const pa = a.tarefa.prioridade === 'alta' ? 0 : a.tarefa.prioridade === 'media' ? 1 : 2;
        const pb = b.tarefa.prioridade === 'alta' ? 0 : b.tarefa.prioridade === 'media' ? 1 : 2;
        if (pa !== pb) return pa - pb;
        const fa = prioridadeFrequencia[a.tarefa.frequencia] ?? 99;
        const fb = prioridadeFrequencia[b.tarefa.frequencia] ?? 99;
        return fa - fb;
      });
      // Algoritmo de distribuicao com limite por dia:
      // Cada morador pode receber no maximo 5 tarefas por dia
      const LIMITE_TAREFAS_DIA = 5;
      const DIAS_UTEIS = considerarDomingo ? 7 : 6; // 7 = domingo a sábado, 6 = segunda a sábado
      const capacidadeTotal = moradoresPresentes.length * DIAS_UTEIS * LIMITE_TAREFAS_DIA;
      if (tarefasExpandidas.length > capacidadeTotal) {
        setErro(`Capacidade excedida: ${tarefasExpandidas.length} tarefas para ${capacidadeTotal} slots (${moradoresPresentes.length} moradores × ${DIAS_UTEIS} dias × ${LIMITE_TAREFAS_DIA} tarefas). Reduza tarefas ou aumente o limite diario.`);
        setDistLoading(false);
        return;
      }
      const cargaPorDia: Record<string, number[]> = {};
      moradoresPresentes.forEach(m => { cargaPorDia[m.uid] = new Array(DIAS_UTEIS).fill(0); });
      // Rastreia quais tarefas ja foram alocadas para cada morador em cada dia
      const tarefasAlocadasPorMorador: Record<string, Record<string, number[]>> = {};
      moradoresPresentes.forEach(m => { tarefasAlocadasPorMorador[m.uid] = {}; });
      let roundRobinIdx = 0;
      const debugLogs: string[] = [];
      function distribuirTarefa(tarefa: TarefaBase, diaFixo: number | null) {
        // Rejeita tarefas no domingo (dia 6 = domingo) apenas se nao considerar domingo
        if (!considerarDomingo && diaFixo === 6) return null;
        // Verifica quais moradores podem receber esta tarefa no dia especificado
        const moradoresDisponiveis = moradoresPresentes.filter(m => {
          const { viajando, diasFora } = moradorViajandoNaSemana(m.uid, semanaSelecionada);
          if (diaFixo !== null) {
            // Tarefa com dia fixo: morador nao pode estar viajando, nao pode atingir limite, e nao pode ter mesma tarefa no mesmo dia
            if (viajando && diasFora.includes(diaFixo)) return false;
            if (cargaPorDia[m.uid][diaFixo] >= LIMITE_TAREFAS_DIA) return false;
            const diasJaUsados = tarefasAlocadasPorMorador[m.uid][tarefa.id] || [];
            if (diasJaUsados.includes(diaFixo)) return false;
            return true;
          }
          // Tarefa sem dia fixo: morador precisa ter pelo menos 1 dia livre (nao viajando e abaixo do limite)
          for (let d = 0; d < DIAS_UTEIS; d++) {
            if (viajando && diasFora.includes(d)) continue;
            if (cargaPorDia[m.uid][d] >= LIMITE_TAREFAS_DIA) continue;
            const diasJaUsados = tarefasAlocadasPorMorador[m.uid][tarefa.id] || [];
            if (diasJaUsados.includes(d)) continue;
            return true; // encontrou pelo menos 1 dia disponivel
          }
          return false;
        });
        if (moradoresDisponiveis.length === 0) return null;
        const sortedMoradores = moradoresDisponiveis.sort((a, b) => {
          const cargaA = tarefasPorMorador[a.uid] || 0;
          const cargaB = tarefasPorMorador[b.uid] || 0;
          if (cargaA !== cargaB) return cargaA - cargaB;
          const execsA = execucoes.filter(e => e.tarefaId === tarefa.id && e.executorId === a.uid).length;
          const execsB = execucoes.filter(e => e.tarefaId === tarefa.id && e.executorId === b.uid).length;
          if (execsA !== execsB) return execsA - execsB;
          const idxA = moradoresPresentes.findIndex(m => m.uid === a.uid);
          const idxB = moradoresPresentes.findIndex(m => m.uid === b.uid);
          const posA = (idxA + roundRobinIdx) % moradoresPresentes.length;
          const posB = (idxB + roundRobinIdx) % moradoresPresentes.length;
          return posA - posB;
        });
        if (sortedMoradores.length === 0) return null;
        const responsavel = sortedMoradores[0];
        tarefasPorMorador[responsavel.uid] = (tarefasPorMorador[responsavel.uid] || 0) + 1;
        roundRobinIdx = (roundRobinIdx + 1) % moradoresPresentes.length;
        let dia = diaFixo;
        if (dia === null) {
          const { diasFora } = moradorViajandoNaSemana(responsavel.uid, semanaSelecionada);
          const diasJaUsados = tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] || [];
          // Encontra o dia com menor carga, respeitando viagem, limite e duplicacao
          let melhorDia = -1;
          let menorCarga = Infinity;
          for (let d = 0; d < DIAS_UTEIS; d++) {
            if (diasFora.includes(d)) continue;
            if (diasJaUsados.includes(d)) continue;
            const c = cargaPorDia[responsavel.uid][d];
            if (c >= LIMITE_TAREFAS_DIA) continue;
            if (c < menorCarga) {
              menorCarga = c;
              melhorDia = d;
            }
          }
          if (melhorDia === -1) return null;
          dia = melhorDia;
          // Registra que esta tarefa foi alocada neste dia
          if (!tarefasAlocadasPorMorador[responsavel.uid][tarefa.id]) tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] = [];
          tarefasAlocadasPorMorador[responsavel.uid][tarefa.id].push(dia);
          debugLogs.push(`[DEBUG] Registrada tarefa ${tarefa.id} para ${responsavel.name} no dia ${dia}. Usados agora: [${tarefasAlocadasPorMorador[responsavel.uid][tarefa.id].join(',')}]`);
        } else {
          // Também registra para tarefas com dia fixo, para evitar duplicacao
          if (!tarefasAlocadasPorMorador[responsavel.uid][tarefa.id]) tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] = [];
          tarefasAlocadasPorMorador[responsavel.uid][tarefa.id].push(dia);
          debugLogs.push(`[DEBUG] Registrada tarefa ${tarefa.id} (dia fixo ${dia}) para ${responsavel.name}. Usados agora: [${tarefasAlocadasPorMorador[responsavel.uid][tarefa.id].join(',')}]`);
        }
        cargaPorDia[responsavel.uid][dia] = (cargaPorDia[responsavel.uid][dia] || 0) + 1;
        const logMsg = `[DIST] ${tarefa.titulo} (id=${tarefa.id}) -> ${responsavel.name} no dia ${dia}. Carga: [${cargaPorDia[responsavel.uid].join(',')}]. Usados: [${(tarefasAlocadasPorMorador[responsavel.uid][tarefa.id] || []).join(',')}]`;
        debugLogs.push(logMsg);
        return { tarefa, dia, responsavel };
      }
      // Aloca tarefas com dia definido
      tarefasExpandidas.filter(({ tarefa }) => tarefa.diasSemana?.length > 0).forEach(({ tarefa, dia }) => {
        const result = distribuirTarefa(tarefa, dia);
        if (result) {
          atribuicoes.push({ id: `${Date.now()}-${Math.random()}`, tarefaId: tarefa.id, titulo: tarefa.titulo, descricao: tarefa.descricao, prioridade: tarefa.prioridade, responsavelId: result.responsavel.uid, responsavelNome: result.responsavel.name, diaSemana: result.dia, status: 'pendente' });
        }
      });
      // Aloca tarefas sem dia definido (algoritmo otimiza)
      tarefasExpandidas.filter(({ tarefa }) => !tarefa.diasSemana?.length).forEach(({ tarefa }) => {
        const result = distribuirTarefa(tarefa, null);
        if (result) {
          atribuicoes.push({ id: `${Date.now()}-${Math.random()}`, tarefaId: tarefa.id, titulo: tarefa.titulo, descricao: tarefa.descricao, prioridade: tarefa.prioridade, responsavelId: result.responsavel.uid, responsavelNome: result.responsavel.name, diaSemana: result.dia, status: 'pendente' });
        }
      });
      const distRef = collection(db, 'distribuicoes');
      const qd = query(distRef, where('casaId', '==', casaId));
      const sd = await getDocs(qd);
      const existente = sd.docs.find(d => (d.data() as any).weekId === semanaSelecionada);
      if (existente) { await updateDoc(doc(db, 'distribuicoes', existente.id), { atribuicoes }); }
      else { await addDoc(distRef, { casaId, weekId: semanaSelecionada, atribuicoes, createdAt: serverTimestamp() }); }
      const resumo = moradoresPresentes.map(m => `${m.name}: ${tarefasPorMorador[m.uid] || 0}`).join(', ');
      setSucesso(`${atribuicoes.length} tarefas distribuídas. ${resumo}`);
      setDebugLog(debugLogs);
      await carregarDadosDistribuicao();
    } catch (e: any) { setErro('Erro ao gerar tarefas: ' + e.message); }
    setDistLoading(false);
  }

  async function redistribuirTarefas() {
    if (!distribuicao || moradoresPresentes.length === 0) return;
    setDistLoading(true); setErro(''); setSucesso('');
    try {
      const concluidas = distribuicao.atribuicoes.filter(a => a.status === 'concluída');
      const pendentes = distribuicao.atribuicoes.filter(a => a.status === 'pendente');
      const concluidasPorMorador: Record<string, number> = {};
      concluidas.forEach(a => { concluidasPorMorador[a.responsavelId] = (concluidasPorMorador[a.responsavelId] || 0) + 1; });
      const novasAtribuicoes: Atribuicao[] = [...concluidas];
      const tarefasPorMorador: Record<string, number> = {};
      moradoresPresentes.forEach(m => { tarefasPorMorador[m.uid] = concluidasPorMorador[m.uid] || 0; });
      pendentes.forEach(p => {
        const sortedMoradores = [...moradoresPresentes].sort((a, b) => {
          const execsA = execucoes.filter(e => e.tarefaId === p.tarefaId && e.executorId === a.uid).length;
          const execsB = execucoes.filter(e => e.tarefaId === p.tarefaId && e.executorId === b.uid).length;
          return (tarefasPorMorador[a.uid] || 0) + execsA - ((tarefasPorMorador[b.uid] || 0) + execsB);
        });
        if (sortedMoradores.length > 0) { const r = sortedMoradores[0]; tarefasPorMorador[r.uid] = (tarefasPorMorador[r.uid] || 0) + 1; novasAtribuicoes.push({ ...p, responsavelId: r.uid, responsavelNome: r.name }); }
      });
      await updateDoc(doc(db, 'distribuicoes', distribuicao.id), { atribuicoes: novasAtribuicoes });
      setSucesso('Tarefas redistribuídas!');
      await carregarDadosDistribuicao();
    } catch (e: any) { setErro('Erro ao redistribuir: ' + e.message); }
    setDistLoading(false);
  }

  async function toggleTarefaDistribuicao(atribuicao: Atribuicao) {
    if (!distribuicao || !user?.uid || !casaSelecionada?.id) return;
    try {
      const isConcluindo = atribuicao.status === 'pendente';
      // Desfazer remove o registro de execucao criado ao concluir, para nao inflar o historico usado no desempate.
      // Executor gravado e o responsavel pela atribuicao (nao o admin que fez o toggle), pois e quem de fato realizou a tarefa.
      let execucaoId = atribuicao.execucaoId;
      if (isConcluindo) {
        const ref = await addDoc(collection(db, 'execucoes'), { tarefaId: atribuicao.tarefaId, titulo: atribuicao.titulo, executorId: atribuicao.responsavelId, executorNome: atribuicao.responsavelNome, weekId: distribuicao.weekId, data: new Date().toISOString(), casaId: casaSelecionada.id });
        execucaoId = ref.id;
      } else if (atribuicao.execucaoId) {
        await deleteDoc(doc(db, 'execucoes', atribuicao.execucaoId));
        execucaoId = undefined;
      }
      const novasAtribuicoes = distribuicao.atribuicoes.map(a => {
        if (a.id === atribuicao.id) { const novoStatus: 'pendente' | 'concluída' = isConcluindo ? 'concluída' : 'pendente'; return { ...a, status: novoStatus, dataConclusao: isConcluindo ? new Date().toISOString() : undefined, execucaoId }; }
        return a;
      });
      await updateDoc(doc(db, 'distribuicoes', distribuicao.id), { atribuicoes: novasAtribuicoes });
      setDistribuicao({ ...distribuicao, atribuicoes: novasAtribuicoes });
    } catch (e: any) { setErro('Erro: ' + e.message); }
  }

  async function handleExcluirDistribuicao() {
    if (!distribuicao) return;
    if (!confirm(`Excluir a distribuição da semana ${semanaSelecionada}?\n\nTodas as atribuições serão perdidas.`)) return;
    setDistLoading(true);
    try {
      await deleteDoc(doc(db, 'distribuicoes', distribuicao.id));
      setDistribuicao(null);
      setSucesso('Distribuição excluída!');
    } catch (e: any) { setErro('Erro ao excluir: ' + e.message); }
    setDistLoading(false);
  }

  const abas: { key: Aba; label: string; icon: string }[] = [
    { key: 'casas', label: 'Casas', icon: '🏠' },
    { key: 'comodos', label: 'Cômodos', icon: '🚪' },
    { key: 'tarefas', label: 'Tarefas', icon: '✅' },
    { key: 'moradores', label: 'Moradores', icon: '👥' },
    { key: 'distribuição', label: 'Distribuição', icon: '📊' },
    { key: 'notificações', label: 'Notificações', icon: '🔔' },
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface pb-24">
      <TopAppBar
        onMenuClick={openMenu}
        onNotificationClick={openNotifications}
        title="Caule" subtitle="Configurações" />
      <main className="px-margin-page py-stack-md">
        <p className="text-on-surface-variant mb-4">Gerencie suas Casas</p>

        {/* Cards de navegação - formato icon grid */}
        <div className="grid grid-cols-2 gap-gutter-grid mb-6">
          {abas.map(a => {
            const isActive = abaAtiva === a.key;
            return (
              <button
                key={a.key}
                onClick={() => { setAbaAtiva(a.key); setErro(''); setSucesso(''); }}
                className={`bg-surface-card rounded-xl p-5 flex flex-col items-center text-center transition-all ${isActive ? 'ring-2 ring-primary/50 scale-[1.02]' : 'hover:bg-surface-container'}`}
              >
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-3">
                  <span className="text-3xl">{a.icon}</span>
                </div>
                <span className="text-base font-bold text-on-surface">{a.label}</span>
              </button>
            );
          })}
        </div>

        {/* Casa seletor */}
        {abaAtiva !== 'casas' && abaAtiva !== 'notificações' && (
          <div className="mb-4">
            <label className="text-label-sm text-on-surface-variant block mb-1">Casa</label>
            <select value={casaSelecionada?.id || ''} onChange={e => { const c = casas.find(x => x.id === e.target.value); setCasaSelecionada(c || null); }} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
              {casas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {/* Mensagens globais */}
        {erro && <div className="mb-4 p-3 bg-error-container/20 border border-error/30 rounded-lg text-error text-sm">{erro}</div>}
        {sucesso && <div className="mb-4 p-3 bg-primary-container/20 border border-primary/30 rounded-lg text-primary text-sm">{sucesso}</div>}

        {/* === CASAS === */}
        {abaAtiva === 'casas' && (
          <div className="space-y-4">
            {/* Casa Ativa - destaque */}
            {casaSelecionada && (
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-on-primary">check</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Casa Ativa</p>
                  <h4 className="font-bold text-on-surface truncate">{casaSelecionada.nome}</h4>
                  <p className="text-caption text-on-surface-variant truncate">{casaSelecionada.endereco}, {casaSelecionada.cidade}</p>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-3">
              <h3 className="font-section-heading text-section-heading">{editandoCasaId ? 'Editar Casa' : 'Nova Casa'}</h3>
              <input value={formCasa.nome} onChange={e => setFormCasa({ ...formCasa, nome: e.target.value })} placeholder="Nome" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              <input value={formCasa.endereco} onChange={e => setFormCasa({ ...formCasa, endereco: e.target.value })} placeholder="Endereço" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              <div className="flex flex-wrap gap-2">
                <input value={formCasa.cidade} onChange={e => setFormCasa({ ...formCasa, cidade: e.target.value })} placeholder="Cidade" className="flex-1 min-w-0 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                <input value={formCasa.estado} onChange={e => setFormCasa({ ...formCasa, estado: e.target.value })} placeholder="UF" className="w-14 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                <input value={formCasa.cep} onChange={e => setFormCasa({ ...formCasa, cep: e.target.value })} placeholder="CEP" className="w-28 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1">Senha de cadastro</label>
                <input value={formCasa.senhaCadastro} onChange={e => setFormCasa({ ...formCasa, senhaCadastro: e.target.value })} placeholder="ex: perguntaproabacaté" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                <p className="text-[10px] text-on-surface-variant mt-1">Os novos usuários precisarão digitar esta senha para se associar à casa.</p>
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-2">Foto da casa</label>
                {editandoCasaId ? (
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ${uploadingFotoCasa ? 'opacity-50' : ''}`}
                    >
                      {formCasa.foto ? (
                        <img src={formCasa.foto} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant text-2xl">home</span>
                        </div>
                      )}
                      {uploadingFotoCasa && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="material-symbols-outlined animate-spin text-white text-xl">refresh</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={triggerFotoCasaUpload}
                        disabled={uploadingFotoCasa}
                        className="px-3 py-2 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-all disabled:opacity-50"
                      >
                        {formCasa.foto ? 'Trocar foto' : 'Adicionar foto'}
                      </button>
                      <p className="text-[10px] text-on-surface-variant mt-1">
                        Foto que aparecerá na tela de boas-vindas para novos moradores. Máx 4MB.
                      </p>
                    </div>
                    <input
                      ref={fileInputCasaRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFotoCasaChange}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-on-surface-variant text-2xl">home</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant">
                      Salve a casa primeiro para adicionar uma foto.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleSalvarCasa} className="flex-1 bg-primary-container text-on-primary-container font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">{editandoCasaId ? 'Atualizar' : 'Criar'}</button>
                {editandoCasaId && <button onClick={() => { setEditandoCasaId(null); setFormCasa({ nome: '', endereco: '', cidade: '', estado: '', cep: '', senhaCadastro: '', foto: '' }); }} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>}
              </div>
            </div>

            {/* Lista de casas com selecao explicita */}
            <div>
              <h3 className="text-label-sm text-on-surface-variant mb-2">Selecione a casa ativa</h3>
              <div className="space-y-2">
                {casas.map(c => {
                  const isAtiva = casaSelecionada?.id === c.id;
                  return (
                    <div key={c.id} className={`bg-surface-card rounded-xl border p-3 transition-all ${isAtiva ? 'border-primary shadow-sm shadow-primary/10' : 'border-outline-variant'}`}>
                      <div className="flex items-center gap-3">
                        {/* Botao de selecao */}
                        <button
                          onClick={() => setCasaSelecionada(c)}
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isAtiva ? 'bg-primary' : 'bg-surface-container-high border-2 border-outline-variant hover:border-primary'}`}
                        >
                          {isAtiva && <span className="material-symbols-outlined text-on-primary text-sm">check</span>}
                        </button>
                        {/* Info da casa */}
                        <div onClick={() => setCasaSelecionada(c)} className="flex-1 min-w-0 cursor-pointer flex items-center gap-3">
                          {c.foto ? (
                            <img src={c.foto} alt={c.nome} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-on-surface-variant">home</span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold truncate ${isAtiva ? 'text-primary' : 'text-on-surface'}`}>{c.nome}</h4>
                              {isAtiva && <span className="flex-shrink-0 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase">Ativa</span>}
                            </div>
                            <p className="text-caption text-on-surface-variant truncate">{c.endereco}, {c.cidade} - {c.estado}</p>
                          </div>
                        </div>
                        {/* Acoes */}
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => { setEditandoCasaId(c.id); setFormCasa({ nome: c.nome, endereco: c.endereco, cidade: c.cidade, estado: c.estado, cep: c.cep, senhaCadastro: c.senhaCadastro || '', foto: c.foto || '' }); }} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                          <button onClick={() => handleExcluirCasa(c.id)} className="p-1.5 text-error hover:bg-error/10 rounded-lg"><span className="material-symbols-outlined text-lg">delete</span></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* === CÔMODOS === */}
        {abaAtiva === 'comodos' && (
          <div className="space-y-2 relative">
            {comodos.map(c => {
              const responsavel = moradores.find(m => m.uid === c.responsavelId);
              return (
                <div key={c.id} className="bg-surface-card rounded-xl border border-outline-variant p-3 flex justify-between items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">{c.icone}</span>
                    <div className="min-w-0">
                      <h4 className="font-bold text-on-surface truncate">{c.nome}</h4>
                      <span className="text-caption text-on-surface-variant capitalize">
                        {c.tipo}{responsavel ? ` • ${responsavel.name}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => abrirModalEditarComodo(c)} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                    <button onClick={() => handleExcluirComodo(c.id)} className="p-1.5 text-error hover:bg-error/10 rounded-lg"><span className="material-symbols-outlined text-lg">delete</span></button>
                  </div>
                </div>
              );
            })}

            {/* FAB + */}
            <button
              onClick={abrirModalNovoComodo}
              className="fixed bottom-20 right-4 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-on-primary z-40 hover:brightness-110 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-3xl">add</span>
            </button>

            {/* Modal Cômodo */}
            {modalComodoOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={fecharModalComodo} />
                <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-section-heading text-section-heading">{editandoComodoId ? 'Editar Cômodo' : 'Novo Cômodo'}</h3>
                    <button onClick={fecharModalComodo} className="p-1 hover:bg-surface-container rounded-full transition-colors">
                      <span className="material-symbols-outlined text-on-surface-variant">close</span>
                    </button>
                  </div>
                  <input value={formComodo.nome} onChange={e => { const nome = e.target.value; setFormComodo({ ...formComodo, nome, icone: sugerirEmoji(nome) }); }} placeholder="Nome do cômodo" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  <div className="flex items-center gap-2">
                    <label className="text-label-sm text-on-surface-variant">Emoji</label>
                    <input
                      type="text"
                      value={formComodo.icone}
                      onChange={e => setFormComodo({ ...formComodo, icone: e.target.value })}
                      placeholder="🏠"
                      maxLength={4}
                      className="w-16 text-center bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-1 text-lg"
                    />
                    <span className="text-xs text-on-surface-variant">Sugestão automática — edite à vontade</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setFormComodo({ ...formComodo, tipo: 'coletivo' })} className={`flex-1 py-2 rounded-lg text-sm ${formComodo.tipo === 'coletivo' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>Coletivo</button>
                    <button onClick={() => setFormComodo({ ...formComodo, tipo: 'privado' })} className={`flex-1 py-2 rounded-lg text-sm ${formComodo.tipo === 'privado' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>Privado</button>
                  </div>
                  {formComodo.tipo === 'privado' && (
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Morador responsável</label>
                      <select
                        value={formComodo.responsavelId}
                        onChange={e => setFormComodo({ ...formComodo, responsavelId: e.target.value })}
                        className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
                      >
                        <option value="">Selecione um morador</option>
                        {moradores.filter(m => m.role !== 'hospede').map(m => (
                          <option key={m.uid} value={m.uid}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleSalvarComodo} className="flex-1 bg-primary-container text-on-primary-container font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">{editandoComodoId ? 'Atualizar' : 'Criar'}</button>
                    <button onClick={fecharModalComodo} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === TAREFAS === */}
        {abaAtiva === 'tarefas' && (
          <div className="space-y-2 relative">
            {/* Contadores de tarefas */}
            {(() => {
              const total = tarefas.length;
              const alta = tarefas.filter(t => t.prioridade === 'alta').length;
              const media = tarefas.filter(t => t.prioridade === 'media').length;
              const baixa = tarefas.filter(t => t.prioridade === 'baixa').length;
              const porComodo: Record<string, { total: number; alta: number; media: number; baixa: number }> = {};
              tarefas.forEach(t => {
                const c = comodos.find(c => c.id === t.comodoId);
                const nome = c ? c.nome : 'Sem cômodo';
                if (!porComodo[nome]) porComodo[nome] = { total: 0, alta: 0, media: 0, baixa: 0 };
                porComodo[nome].total++;
                porComodo[nome][t.prioridade]++;
              });
              return (
                <div className="bg-surface-card rounded-xl border border-outline-variant p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">checklist</span>
                    <span className="font-bold text-on-surface">Tarefas: {total}</span>
                    <span className="text-[10px] text-on-surface-variant">(Alta {alta} | Média {media} | Baixa {baixa})</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(porComodo).map(([nome, counts]) => (
                      <span key={nome} className="text-[10px] px-2 py-0.5 bg-surface-container-high rounded-full text-on-surface-variant">
                        {nome}: {counts.total} (A{counts.alta} M{counts.media} B{counts.baixa})
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Agrupar tarefas por cômodo */}
            {(() => {
              const tarefasPorComodo: Record<string, Tarefa[]> = {};
              const tarefasSemComodo: Tarefa[] = [];
              tarefas.forEach(t => {
                const comodo = comodos.find(c => c.id === t.comodoId);
                if (!comodo) {
                  tarefasSemComodo.push(t);
                } else {
                  if (!tarefasPorComodo[t.comodoId]) tarefasPorComodo[t.comodoId] = [];
                  tarefasPorComodo[t.comodoId].push(t);
                }
              });
              return (
                <>
                  {Object.entries(tarefasPorComodo).map(([comodoId, tarefasDoComodo]) => {
                    const comodo = comodos.find(c => c.id === comodoId);
                    if (!comodo) return null;
                    return (
                      <div key={comodoId} className="space-y-2">
                        {/* Separador com nome do cômodo */}
                        <div className="flex items-center gap-2 py-2">
                          <span className="text-lg">{comodo.icone}</span>
                          <span className="text-sm font-bold text-on-surface">{comodo.nome}</span>
                          <div className="flex-1 h-px bg-outline-variant" />
                        </div>
                        {tarefasDoComodo.map(t => (
                          <div key={t.id} className="bg-surface-card rounded-xl border border-outline-variant p-3">
                            <div className="flex justify-between items-start">
                              <div className="min-w-0">
                                <h4 className="font-bold text-on-surface truncate">{t.titulo}</h4>
                                <p className="text-caption text-on-surface-variant truncate">{t.descricao}</p>
                                <div className="flex gap-2 mt-1">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.prioridade === 'alta' ? 'bg-tertiary-container/20 text-tertiary-container' : t.prioridade === 'media' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-gray-400/10 text-gray-500'}`}>{t.prioridade.toUpperCase()}</span>
                                  <span className="text-[10px] text-text-muted capitalize">{t.frequencia}</span>
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => abrirModalEditarTarefa(t)} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                                <button onClick={() => handleDuplicarTarefa(t)} className="p-1.5 text-[#2196F3] hover:bg-[#2196F3]/10 rounded-lg"><span className="material-symbols-outlined text-lg">content_copy</span></button>
                                <button onClick={() => handleExcluirTarefa(t.id)} className="p-1.5 text-error hover:bg-error/10 rounded-lg"><span className="material-symbols-outlined text-lg">delete</span></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {/* Tarefas sem cômodo */}
                  {tarefasSemComodo.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 py-2">
                        <span className="text-lg">❓</span>
                        <span className="text-sm font-bold text-on-surface">Sem cômodo</span>
                        <div className="flex-1 h-px bg-outline-variant" />
                      </div>
                      {tarefasSemComodo.map(t => (
                        <div key={t.id} className="bg-surface-card rounded-xl border border-outline-variant p-3">
                          <div className="flex justify-between items-start">
                            <div className="min-w-0">
                              <h4 className="font-bold text-on-surface truncate">{t.titulo}</h4>
                              <p className="text-caption text-on-surface-variant truncate">{t.descricao}</p>
                              <div className="flex gap-2 mt-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.prioridade === 'alta' ? 'bg-tertiary-container/20 text-tertiary-container' : t.prioridade === 'media' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-gray-400/10 text-gray-500'}`}>{t.prioridade.toUpperCase()}</span>
                                <span className="text-[10px] text-text-muted capitalize">{t.frequencia}</span>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => abrirModalEditarTarefa(t)} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-lg">edit</span></button>
                              <button onClick={() => handleExcluirTarefa(t.id)} className="p-1.5 text-error hover:bg-error/10 rounded-lg"><span className="material-symbols-outlined text-lg">delete</span></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* FAB + */}
            <button
              onClick={abrirModalNovaTarefa}
              className="fixed bottom-20 right-4 w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-on-primary z-40 hover:brightness-110 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-3xl">add</span>
            </button>

            {/* Modal Tarefa */}
            {modalTarefaOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={fecharModalTarefa} />
                <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-outline-variant space-y-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="font-section-heading text-section-heading">{editandoTarefaId ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
                    <button onClick={fecharModalTarefa} className="p-1 hover:bg-surface-container rounded-full transition-colors">
                      <span className="material-symbols-outlined text-on-surface-variant">close</span>
                    </button>
                  </div>
                  {erro && <div className="p-3 bg-error-container/20 border border-error/30 rounded-lg text-error text-sm">{erro}</div>}
                  {sucesso && <div className="p-3 bg-primary-container/20 border border-primary/30 rounded-lg text-primary text-sm">{sucesso}</div>}
                  <input value={formTarefa.titulo} onChange={e => setFormTarefa({ ...formTarefa, titulo: e.target.value })} placeholder="Título" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  <textarea value={formTarefa.descricao} onChange={e => setFormTarefa({ ...formTarefa, descricao: e.target.value })} placeholder="Descrição" rows={2} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm resize-none" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={formTarefa.prioridade} onChange={e => setFormTarefa({ ...formTarefa, prioridade: e.target.value as 'alta' | 'media' | 'baixa' })} className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                      <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                    </select>
                    <select value={formTarefa.frequencia} onChange={e => setFormTarefa({ ...formTarefa, frequencia: e.target.value as Tarefa['frequencia'] })} className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                      <option value="unica">Única</option><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option>
                    </select>
                  </div>
                  {formTarefa.frequencia === 'unica' && (
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Data da Tarefa</label>
                      <input
                        type="date"
                        value={formTarefa.dataUnica}
                        onChange={e => setFormTarefa({ ...formTarefa, dataUnica: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        max={(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().split('T')[0]; })()}
                        className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm"
                      />
                    </div>
                  )}
                  {formTarefa.frequencia === 'mensal' && formTarefa.prioridade === 'alta' && (
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Dia do Mês</label>
                      <select value={formTarefa.diaMes} onChange={e => setFormTarefa({ ...formTarefa, diaMes: parseInt(e.target.value) })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                        {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                    </div>
                  )}
                  {formTarefa.frequencia === 'semanal' && formTarefa.prioridade !== 'alta' && (
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Vezes por Semana</label>
                      <select value={formTarefa.vezesPorSemana} onChange={e => setFormTarefa({ ...formTarefa, vezesPorSemana: parseInt(e.target.value) })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                        <option value={1}>1 vez por semana</option>
                        <option value={2}>2 vezes por semana</option>
                        <option value={3}>3 vezes por semana</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-1">
                      {['semanal','quinzenal'].includes(formTarefa.frequencia) && formTarefa.prioridade === 'alta' ? 'Dias da Semana (obrigatório)' : 'Dias da Semana'}
                    </label>
                    <div className={`flex gap-1 ${['unica','diaria','mensal'].includes(formTarefa.frequencia) || (['semanal','quinzenal'].includes(formTarefa.frequencia) && formTarefa.prioridade !== 'alta') ? 'opacity-50 pointer-events-none' : ''}`}>
                      {DIAS_SEMANA.map(d => {
                        const ativo = formTarefa.diasSemana.includes(d.key);
                        return (
                          <button key={d.key} onClick={() => setFormTarefa({ ...formTarefa, diasSemana: ativo ? formTarefa.diasSemana.filter(x => x !== d.key) : [...formTarefa.diasSemana, d.key] })} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${ativo ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'}`}>
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    {formTarefa.frequencia === 'semanal' && formTarefa.prioridade !== 'alta' && (
                      <p className="text-[10px] text-on-surface-variant mt-1">Algoritmo distribuirá automaticamente em {formTarefa.vezesPorSemana}x na semana nos dias mais otimizados</p>
                    )}
                    {formTarefa.frequencia === 'mensal' && formTarefa.prioridade !== 'alta' && (
                      <p className="text-[10px] text-on-surface-variant mt-1">Algoritmo distribuirá automaticamente na semana mais otimizada</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Horário Limite</label>
                      <input type="time" value={formTarefa.horarioLimite} onChange={e => setFormTarefa({ ...formTarefa, horarioLimite: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-label-sm text-on-surface-variant block mb-1">Tipo</label>
                      <select value={formTarefa.tipo} onChange={e => setFormTarefa({ ...formTarefa, tipo: e.target.value as 'coletiva' | 'privada' })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                        <option value="coletiva">Coletiva</option><option value="privada">Privada</option>
                      </select>
                    </div>
                  </div>
                  <select value={formTarefa.comodoId} onChange={e => setFormTarefa({ ...formTarefa, comodoId: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                    <option value="">Selecione um cômodo</option>
                    {comodos.filter(c => c.tipo === 'coletivo' || c.responsavelId === user?.uid).map(c => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleSalvarTarefa} className="flex-1 bg-primary-container text-on-primary-container font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">{editandoTarefaId ? 'Atualizar' : 'Criar'}</button>
                    <button onClick={fecharModalTarefa} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === MORADORES === */}
        {abaAtiva === 'moradores' && (
          <div className="space-y-4">
            {/* Formulario completo de edicao */}
            {editandoMoradorId && (
              <div className="bg-surface-card rounded-xl border border-primary/30 p-4 space-y-3 shadow-lg">
                <div className="flex justify-between items-center">
                  <h3 className="font-section-heading text-section-heading">Editar Morador</h3>
                  <button onClick={() => { setEditandoMoradorId(null); setFormMoradorCompleto({}); }} className="p-1 text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
                </div>

                {/* Dados basicos */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Nome / Apelido</label>
                    <input value={formMoradorCompleto.name || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, name: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Email</label>
                    <input value={formMoradorCompleto.email || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, email: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Funcao</label>
                  <select value={formMoradorCompleto.role || 'morador'} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, role: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                    <option value="admin">Admin</option>
                    <option value="morador">Morador</option>
                    <option value="hospede">Hospede</option>
                  </select>
                </div>

                {/* Contato */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Telefone</label>
                    <input value={formMoradorCompleto.phone || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, phone: e.target.value })} placeholder="ex: 11999998888" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Data Nasc.</label>
                    <input type="date" value={formMoradorCompleto.birthDate || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, birthDate: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  </div>
                </div>

                {/* Bio e emergencia */}
                <div>
                  <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Bio / Observacoes</label>
                  <textarea value={formMoradorCompleto.bio || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, bio: e.target.value })} placeholder="Informações sobre o morador..." rows={2} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Contato Emergencia</label>
                    <input value={formMoradorCompleto.emergencyContact || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, emergencyContact: e.target.value })} placeholder="Nome e telefone" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                  </div>
                  {formMoradorCompleto.role === 'morador' ? (
                    <div>
                      <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Chave PIX</label>
                      <input value={formMoradorCompleto.pixKey || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, pixKey: e.target.value })} placeholder="CPF, CNPJ, email, celular ou chave aleatória" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Quarto</label>
                      <input value={formMoradorCompleto.room || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, room: e.target.value })} placeholder="ex: Quarto 2" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                    </div>
                  )}
                </div>

                {/* Viagens / Estadia */}
                {formMoradorCompleto.role === 'morador' ? (
                  <div className="border-t border-outline-variant pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-on-surface">Viagens</h4>
                      <button
                        onClick={() => { setNovaViagem({ destino: '', dataSaida: '', dataRetorno: '', motivo: '' }); setEditandoViagemId(null); }}
                        className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-all"
                      >
                        + Adicionar Viagem
                      </button>
                    </div>
                    {/* Lista de viagens */}
                    {viagensMoradorEditando.length > 0 && (
                      <div className="space-y-2">
                        {viagensMoradorEditando.map(v => (
                          <div key={v.id} className="bg-surface-container-high rounded-lg p-2 flex justify-between items-center">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-on-surface truncate">{v.destino}</p>
                              <p className="text-[10px] text-on-surface-variant">{v.dataSaida} → {v.dataRetorno}</p>
                              {v.motivo && <p className="text-[10px] text-on-surface-variant truncate">{v.motivo}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => { setNovaViagem({ destino: v.destino, dataSaida: v.dataSaida, dataRetorno: v.dataRetorno, motivo: v.motivo }); setEditandoViagemId(v.id); }}
                                className="p-1 text-primary hover:bg-primary/10 rounded-lg"
                              >
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                              <button
                                onClick={() => excluirViagem(v.id)}
                                className="p-1 text-error hover:bg-error/10 rounded-lg"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Form de viagem */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Destino</label>
                        <input value={novaViagem.destino} onChange={e => setNovaViagem({ ...novaViagem, destino: e.target.value })} placeholder="ex: São Paulo" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Motivo</label>
                        <input value={novaViagem.motivo} onChange={e => setNovaViagem({ ...novaViagem, motivo: e.target.value })} placeholder="ex: Trabalho" className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Data Saída</label>
                        <input type="date" value={novaViagem.dataSaida} onChange={e => setNovaViagem({ ...novaViagem, dataSaida: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Data Retorno</label>
                        <input type="date" value={novaViagem.dataRetorno} onChange={e => setNovaViagem({ ...novaViagem, dataRetorno: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                    </div>
                    <button onClick={salvarViagem} className="w-full bg-primary-container text-on-primary-container font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">
                      {editandoViagemId ? 'Atualizar Viagem' : 'Salvar Viagem'}
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-outline-variant pt-3 space-y-3">
                    <h4 className="text-sm font-bold text-on-surface">Período de Estadia</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Data Início</label>
                        <input type="date" value={formMoradorCompleto.estadiaInicio || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, estadiaInicio: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Data Fim</label>
                        <input type="date" value={formMoradorCompleto.estadiaFim || ''} onChange={e => setFormMoradorCompleto({ ...formMoradorCompleto, estadiaFim: e.target.value })} className="w-full bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
                      </div>
                    </div>
                    {formMoradorCompleto.estadiaInicio && formMoradorCompleto.estadiaFim && (
                      <button onClick={handleExcluirEstadiaMorador} className="w-full bg-error/10 text-error border border-error/30 font-bold py-2 rounded-lg text-sm hover:bg-error/20 transition-all">
                        Excluir Estadia
                      </button>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleSalvarMoradorCompleto} className="flex-1 bg-primary text-on-primary font-bold py-2 rounded-lg text-sm hover:brightness-110 transition-all">Salvar Alterações</button>
                  <button onClick={() => { setEditandoMoradorId(null); setFormMoradorCompleto({}); }} className="px-4 py-2 bg-surface-container text-on-surface rounded-lg text-sm border border-outline-variant">Cancelar</button>
                </div>
              </div>
            )}

            {/* Lista de moradores com toggle rapido */}
            <div className="space-y-2">
              {moradores.map(m => (
                <div key={m.uid} className={`bg-surface-card rounded-xl border p-3 transition-all ${m.isPresent ? 'border-primary/30' : 'border-outline-variant opacity-70'}`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <UserAvatar
                      photoURL={m.avatar}
                      name={m.name}
                      isPresent={m.isPresent}
                      size={40}
                      className="flex-shrink-0"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-on-surface text-sm truncate">{m.name || m.fullName || m.email?.split('@')[0] || 'Sem nome'}</h4>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${m.role === 'admin' ? 'bg-error/10 text-error' : m.role === 'hospede' ? 'bg-blue-500/10 text-blue-500' : 'bg-primary/10 text-primary'}`}>
                          {m.role}
                        </span>
                        {(() => {
                          const hoje = new Date().toISOString().split('T')[0];
                          const emViagem = moradorViagens[m.uid] || false;
                          const estadiaFora = m.role === 'hospede' && (!m.estadiaInicio || !m.estadiaFim || hoje < m.estadiaInicio || hoje >= m.estadiaFim);
                          const estaAusente = !m.isPresent || emViagem || estadiaFora;
                          return estaAusente ? <span className="flex-shrink-0 px-2 py-0.5 bg-error/10 rounded-full text-[9px] text-error font-bold">ausente</span> : null;
                        })()}
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">{m.email}</p>
                      {m.phone && <p className="text-[10px] text-on-surface-variant">{m.phone}</p>}
                    </div>

                    {/* Acoes: toggle presente + editar */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Toggle Presente/Ausente */}
                      <button
                        onClick={() => toggleMoradorPresente(m)}
                        className={`relative w-12 h-6 rounded-full transition-all ${m.isPresent ? 'bg-primary' : 'bg-surface-container-high border border-outline-variant'}`}
                        title={m.isPresent ? 'Presente - clique para marcar ausente' : 'Ausente - clique para marcar presente'}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${m.isPresent ? 'left-6 bg-on-primary' : 'left-0.5 bg-on-surface-variant'}`} />
                      </button>

                      {/* Botao editar completo */}
                      <button onClick={() => abrirEdicaoMoradorCompleto(m)} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>

                      {/* Botao excluir */}
                      <button onClick={() => handleExcluirMorador(m)} className="p-1.5 text-error hover:bg-error/10 rounded-lg">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === DISTRIBUICAO === */}
        {abaAtiva === 'distribuição' && (
          <div className="space-y-4">
            {/* Seletor de ano e mes */}
            <div className="flex gap-2">
              <select value={anoSelecionado} onChange={e => { const a = parseInt(e.target.value); setAnoSelecionado(a); const semanas = getSemanasDoMes(a, mesSelecionado); if (semanas.length > 0) setSemanaSelecionada(semanas[0].weekId); }} className="flex-1 bg-surface-card border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                {[anoSelecionado - 2, anoSelecionado - 1, anoSelecionado, anoSelecionado + 1, anoSelecionado + 2].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={mesSelecionado} onChange={e => { const m = parseInt(e.target.value); setMesSelecionado(m); const semanas = getSemanasDoMes(anoSelecionado, m); if (semanas.length > 0) setSemanaSelecionada(semanas[0].weekId); }} className="flex-1 bg-surface-card border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm">
                {['Jáneiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((nome, i) => <option key={i} value={i}>{nome}</option>)}
              </select>
              <button onClick={() => { const hoje = new Date(); setAnoSelecionado(hoje.getFullYear()); setMesSelecionado(hoje.getMonth()); const s = getSemanaDaData(hoje); setSemanaSelecionada(s.weekId); }} className="px-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-xs font-bold whitespace-nowrap">HOJE</button>
            </div>

            {/* Grade de semanas do mes */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-label-sm text-on-surface-variant">Semanas de {['Jáneiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mesSelecionado]} {anoSelecionado}</p>
                <span className="text-xs text-primary font-bold bg-primary/10 px-2 py-1 rounded-md">{semanaSelecionada}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {getSemanasDoMes(anoSelecionado, mesSelecionado).map(s => {
                  const ativa = semanaSelecionada === s.weekId;
                  const ehSemanaAtual = s.weekId === getSemanaAtual(0);
                  return (
                    <button key={s.weekId} onClick={() => setSemanaSelecionada(s.weekId)} className={`p-2 rounded-lg text-center transition-all border ${ativa ? 'bg-primary border-primary text-on-primary' : 'bg-surface-card border-outline-variant text-on-surface hover:bg-surface-variant'} ${ehSemanaAtual && !ativa ? 'ring-1 ring-primary/30' : ''}`}>
                      <p className="text-xs font-bold">{s.label}</p>
                      <p className={`text-[10px] ${ativa ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>{s.inicio} - {s.fim}</p>
                      {ehSemanaAtual && <p className={`text-[8px] font-bold uppercase mt-0.5 ${ativa ? 'text-on-primary' : 'text-primary'}`}>atual</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggle: Considerar domingo */}
            <div className="flex items-center justify-between bg-surface-card rounded-lg border border-outline-variant p-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant">calendar_today</span>
                <div>
                  <p className="text-sm font-bold text-on-surface">Considerar domingo</p>
                  <p className="text-[10px] text-on-surface-variant">{considerarDomingo ? 'Tarefas serão distribuídas de domingo a sábado (7 dias)' : 'Tarefas serão distribuídas de segunda a sábado (6 dias) — sem tarefas aos domingos'}</p>
                </div>
              </div>
              <button
                onClick={() => setConsiderarDomingo(!considerarDomingo)}
                className={`w-12 h-7 rounded-full transition-colors relative ${considerarDomingo ? 'bg-primary' : 'bg-surface-variant border border-outline-variant'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-on-primary shadow transition-transform ${considerarDomingo ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Diagnostico */}
            <div className="flex gap-2 text-center">
              <div className="flex-1 bg-surface-card rounded-lg border border-outline-variant p-2">
                <p className="text-lg font-bold text-on-surface">{tarefasBase.length}</p>
                <p className="text-[10px] text-on-surface-variant">Tarefas cad.</p>
              </div>
              <div className="flex-1 bg-surface-card rounded-lg border border-outline-variant p-2">
                <p className={`text-lg font-bold ${moradoresPresentes.length > 0 ? 'text-primary' : 'text-error'}`}>{moradoresPresentes.length}</p>
                <p className="text-[10px] text-on-surface-variant">Moradores presentes</p>
              </div>
            </div>

            {/* Aviso quando nenhum morador presente */}
            {moradoresPresentes.length === 0 && (
              <div className="bg-error/10 border border-error/30 rounded-xl p-3 text-center">
                <span className="material-symbols-outlined text-error text-lg">warning</span>
                <p className="text-sm text-error font-bold">Nenhum morador presente</p>
                <p className="text-[10px] text-error/70">Va em Moradores e marque quem esta presente na casa</p>
              </div>
            )}

            {/* Lista de moradores presentes que receberao tarefas */}
            {moradoresPresentes.length > 0 && (
              <div className="bg-surface-card rounded-xl border border-primary/20 p-3">
                <p className="text-label-sm text-primary font-bold mb-2">Moradores que receberao tarefas ({moradoresPresentes.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {moradoresPresentes.map(m => (
                    <span key={m.uid} className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">{m.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de tarefas carregadas */}
            {tarefasBase.length > 0 && (
              <div className="bg-surface-card rounded-xl border border-outline-variant p-3 space-y-2">
                <p className="text-label-sm text-on-surface-variant font-bold">Tarefas encontradas:</p>
                {tarefasBase.map(t => {
                  const ns2 = parseInt((semanaSelecionada.match(/-W(\d+)$/) || ['0', '0'])[1], 10);
                  let ativaEstaSemana = true;
                  if (t.frequencia === 'quinzenal') ativaEstaSemana = ns2 % 2 === 1;
                  if (t.frequencia === 'mensal') ativaEstaSemana = ns2 % 4 === 1;
                  return (
                    <div key={t.id} className="flex justify-between items-center py-1 border-b border-outline-variant/30 last:border-0">
                      <span className={`text-sm font-medium ${ativaEstaSemana ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}>{t.titulo}</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] px-2 py-0.5 bg-surface-container-high rounded-full text-on-surface-variant">{t.frequencia}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-primary/10 rounded-full text-primary">{t.diasSemana?.length > 0 ? t.diasSemana.map(d => { const n = parseDiaSemana(d); return n !== null ? DIAS_SEMANA[n].label : d; }).join(',') : 'sem dias'}</span>
                        {!ativaEstaSemana && <span className="text-[10px] px-2 py-0.5 bg-tertiary/10 rounded-full text-tertiary">nao esta semana</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Acoes */}
            <div className="flex gap-2">
              <button onClick={() => { setDebugLog([]); gerarTarefasSemana(); }} disabled={distLoading} className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-lg text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {distribuicao ? 'Gerar Novamente' : 'Gerar Tarefas'}
              </button>
              {distribuicao && (
                <>
                  <button onClick={redistribuirTarefas} disabled={distLoading} className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-lg text-sm hover:bg-surface-container-highest transition-all disabled:opacity-50">
                    Redistribuir
                  </button>
                  <button onClick={handleExcluirDistribuicao} disabled={distLoading} className="px-3 bg-error/10 border border-error/30 text-error rounded-lg hover:bg-error/20 transition-all disabled:opacity-50" title="Excluir distribuição">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </>
              )}
            </div>
            {moradoresPresentes.length === 0 && <p className="text-caption text-error text-center">Nenhum morador presente nesta casa</p>}

            {/* Debug Log - sempre visivel */}
            <div className="bg-error text-on-error font-bold p-2 rounded-lg text-center mb-2">DEBUG V3 - Se ver isso, codigo atualizou</div>
            <div className="bg-surface-card rounded-xl border border-outline-variant p-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-on-surface text-sm">Log de Distribuicao</h4>
                <button onClick={() => setDebugLog([])} className="text-[10px] text-error hover:underline">Limpar</button>
              </div>
              {debugLog.length === 0 ? (
                <p className="text-[10px] text-on-surface-variant">Nenhum log ainda. Clique em "Gerar Tarefas".</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {debugLog.map((log, i) => (
                    <p key={i} className="text-[10px] font-mono text-on-surface-variant border-b border-outline-variant/20 pb-1">{log}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            {distribuicao && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface-card rounded-xl border border-outline-variant p-3 text-center">
                  <p className="text-2xl font-bold text-on-surface">{distribuicao.atribuicoes.length}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase">Total</p>
                </div>
                <div className="bg-surface-card rounded-xl border border-outline-variant p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{distribuicao.atribuicoes.filter(a => a.status === 'pendente').length}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase">Pendentes</p>
                </div>
                <div className="bg-surface-card rounded-xl border border-outline-variant p-3 text-center">
                  <p className="text-2xl font-bold text-secondary">{distribuicao.atribuicoes.filter(a => a.status === 'concluída').length}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase">Concluidas</p>
                </div>
              </div>
            )}

            {/* Visão semanal por dia */}
            {distLoading ? (
              <div className="text-center py-8"><span className="material-symbols-outlined animate-spin text-primary text-3xl">refresh</span></div>
            ) : !distribuicao ? (
              <div className="text-center py-8 bg-surface-card rounded-xl border border-outline-variant">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">calendar_view_week</span>
                <p className="text-on-surface-variant">Nenhuma distribuicao para {semanaSelecionada}</p>
                <p className="text-caption text-text-muted mt-1">Clique em "Gerar Tarefas" para criar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {['Seg','Ter','Qua','Qui','Sex','Sab','Dom'].map((dia, idx) => {
                  const atribDoDia = distribuicao.atribuicoes.filter(a => a.diaSemana === idx);
                  if (atribDoDia.length === 0) return null;
                  const pendentes = atribDoDia.filter(a => a.status === 'pendente');
                  const concluidas = atribDoDia.filter(a => a.status === 'concluída');
                  return (
                    <div key={idx} className="bg-surface-card rounded-xl border border-outline-variant p-3">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-on-surface text-sm">{dia}</h4>
                        <span className="text-[10px] text-on-surface-variant">{pendentes.length} pendentes / {concluidas.length} concluidas</span>
                      </div>
                      <div className="space-y-2">
                        {atribDoDia.map(a => (
                          <div key={a.id} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button onClick={() => toggleTarefaDistribuicao(a)} className="flex-shrink-0">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${a.status === 'concluída' ? 'border-primary bg-primary' : 'border-outline-variant hover:border-primary'}`}>
                                  {a.status === 'concluída' && <span className="material-symbols-outlined text-[12px] text-on-primary">check</span>}
                                </div>
                              </button>
                              <span className={`text-sm truncate ${a.status === 'concluída' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{a.titulo}</span>
                            </div>
                            <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">{a.responsavelNome?.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Tarefas sem dia atribuido */}
                {distribuicao.atribuicoes.filter(a => a.diaSemana === undefined || a.diaSemana < 0 || a.diaSemana > 6).length > 0 && (
                  <div className="bg-surface-card rounded-xl border border-outline-variant p-3">
                    <h4 className="font-bold text-on-surface text-sm mb-2">Sem dia definido</h4>
                    <div className="space-y-2">
                      {distribuicao.atribuicoes.filter(a => a.diaSemana === undefined || a.diaSemana < 0 || a.diaSemana > 6).map(a => (
                        <div key={a.id} className="flex items-center justify-between py-1">
                          <span className="text-sm text-on-surface">{a.titulo}</span>
                          <span className="text-[10px] text-text-muted">{a.responsavelNome?.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* === NOTIFICACOES === */}
        {abaAtiva === 'notificações' && (
          <NotificacoesTab user={user} token={notifToken} setToken={setNotifToken} perm={notifPerm} setPerm={setNotifPerm} loading={notifLoading} setLoading={setNotifLoading} testTitle={testTitle} setTestTitle={setTestTitle} testBody={testBody} setTestBody={setTestBody} logs={logs} setLogs={setLogs} addLog={addLog} />
        )}
      </main>
    </div>
  );
}

/* ===== NOTIFICACOES ===== */
function NotificacoesTab({ user, token, setToken, perm, setPerm, loading, setLoading, testTitle, setTestTitle, testBody, setTestBody, logs, addLog }: any) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-6">
      {/* Usuário */}
      {user?.email && (
        <div className="p-3 bg-surface-container-low rounded-lg">
          <p className="text-caption text-on-surface-variant">Logado como: <span className="text-on-surface">{user.email}</span></p>
        </div>
      )}
      {/* Status */}
      <div className="p-4 bg-surface-card rounded-xl border border-outline-variant flex items-center gap-4">
        <div className="w-10 h-10 bg-primary-container/20 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-xl">notifications</span>
        </div>
        <div>
          <h3 className="font-bold text-on-surface">Status</h3>
          <p className="text-caption text-on-surface-variant">{perm || 'Não solicitado'}</p>
        </div>
      </div>

      {/* Acoes */}
      <div className="p-4 bg-surface-card rounded-xl border border-outline-variant space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-on-surface">Acoes</h3>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-primary hover:underline">
            {showAdvanced ? 'Ocultar avançado' : 'Avançado'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={loading} onClick={async () => { setLoading(true); addLog('Solicitando permissão...'); try { const { PushNotifications } = await import('@capacitor/push-notifications'); await PushNotifications.requestPermissions().then(r => setPerm(r.receive || 'denied')); addLog('Permissão: ' + (perm || 'ok')); } catch (e: any) { setPerm('erro: ' + e.message); addLog('Erro: ' + e.message); } setLoading(false); }} className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg text-sm font-bold disabled:opacity-50 hover:brightness-110 transition-all">
            {loading ? '...' : 'Solicitar Permissão'}
          </button>
          <button onClick={async () => { addLog('Registrando...'); try { const { PushNotifications } = await import('@capacitor/push-notifications'); await PushNotifications.register(); PushNotifications.addListener('registration', (t) => { setToken(t.value); addLog('Token obtido!'); }); PushNotifications.addListener('registrationError', (err) => addLog('Erro: ' + err.error)); } catch (e: any) { addLog('Erro: ' + e.message); } }} className="px-4 py-2 bg-surface-container text-on-surface border border-outline-variant rounded-lg text-sm font-bold hover:bg-surface-container-high transition-all">
            Registrar
          </button>
          {token && <button onClick={() => { navigator.clipboard?.writeText(token); addLog('Token copiado!'); }} className="px-4 py-2 bg-surface-container text-primary border border-outline-variant rounded-lg text-sm font-bold hover:bg-primary/10 transition-all">Copiar Token</button>}
        </div>
        {token && <p className="text-caption text-text-muted font-mono break-all">{showAdvanced ? token : token.substring(0, 50) + '...'}</p>}
      </div>

      {/* Teste */}
      <div className="p-4 bg-surface-card rounded-xl border border-outline-variant space-y-3">
        <h3 className="font-bold text-on-surface">Teste Personalizado</h3>
        <div className="flex gap-2">
          <input value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder="Titulo" className="flex-1 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
          <input value={testBody} onChange={e => setTestBody(e.target.value)} placeholder="Mensagem" className="flex-1 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg py-2 px-3 text-sm" />
        </div>
        <button
          disabled={!testTitle.trim() || !testBody.trim()}
          onClick={async () => {
            addLog('Enviando notificação...');
            try {
              const { LocalNotifications } = await import('@capacitor/local-notifications');
              await LocalNotifications.schedule({
                notifications: [{
                  id: Date.now(),
                  title: testTitle,
                  body: testBody,
                  schedule: { at: new Date(Date.now() + 1000) },
                  sound: 'default',
                }]
              });
              addLog('Notificação enviada!');
              setTestTitle('');
              setTestBody('');
            } catch (e: any) {
              addLog('Erro: ' + e.message);
              try {
                new Notification(testTitle, { body: testBody });
                addLog('Notificação de browser enviada!');
              } catch (e2: any) {
                addLog('Erro browser: ' + e2.message);
              }
            }
          }}
          className="w-full bg-primary text-on-primary font-bold py-2 rounded-lg text-sm disabled:opacity-50 hover:brightness-110 transition-all"
        >
          Enviar Notificacao
        </button>
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="p-3 bg-surface-container-lowest rounded-lg space-y-1 max-h-40 overflow-y-auto">
          <p className="text-xs text-text-muted mb-2">Logs:</p>
          {logs.map((log: string, i: number) => <p key={i} className="text-[10px] font-mono text-on-surface-variant">{log}</p>)}
        </div>
      )}
    </div>
  );
}
