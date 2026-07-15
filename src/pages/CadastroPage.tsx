import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { TopAppBar } from '@/components/TopAppBar';
import { formatPhoneNumberOnly, formatCpf, isValidPhone, isValidCpf } from '@/utils/formatters';

type Pronome = 'ela' | 'ele' | 'elu';

interface Concordancia {
  chamado: string;
  bemVindo: string;
  vinculada: string;
  presente: string;
  ausente: string;
}

const CONCORDANCIA: Record<Pronome, Concordancia> = {
  ela: { chamado: 'chamada', bemVindo: 'Bem-vinda', vinculada: 'vinculada', presente: 'presente', ausente: 'ausente' },
  ele: { chamado: 'chamado', bemVindo: 'Bem-vindo', vinculada: 'vinculado', presente: 'presente', ausente: 'ausente' },
  elu: { chamado: 'chamade', bemVindo: 'Bem-vinde', vinculada: 'vinculade', presente: 'presente', ausente: 'ausente' },
};

export function CadastroPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useAuthStore();
  
  // Detecta se estamos no modo "completar perfil" (usuário veio do Google)
  const isGoogleMode = location.pathname === '/completar-perfil';
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [pronome, setPronome] = useState<Pronome>('ela');
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [ddi, setDdi] = useState('+55');
  const [ddd, setDdd] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cpf, setCpf] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [senhaCasa, setSenhaCasa] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const c = CONCORDANCIA[pronome];

  const isBrasil = ddi.replace(/\D/g, '') === '55';

  function limparErro() { setErro(''); }

  function validarNomeCompleto(nome: string): boolean {
    const trimmed = nome.trim();
    if (trimmed.length < 3) return false;
    const partes = trimmed.split(/\s+/).filter(Boolean);
    return partes.length >= 2 && /^[a-zA-ZÀ-ÖØ-öø-ÿ\s'-]+$/.test(trimmed);
  }

  function validarStep1(): boolean {
    if (!pronome) { setErro('Selecione um pronome.'); return false; }
    if (!name.trim()) { setErro(`Informe como quer ser ${c.chamado}.`); return false; }
    if (name.trim().length < 2) { setErro('O nome precisa ter pelo menos 2 caracteres.'); return false; }
    return true;
  }

  function validarStep2(): boolean {
    if (!validarNomeCompleto(fullName)) { setErro('Informe o nome completo (nome e sobrenome, apenas letras).'); return false; }
    if (!birthDate) { setErro('Informe a data de nascimento.'); return false; }
    const hoje = new Date();
    const nasc = new Date(birthDate);
    const idade = hoje.getFullYear() - nasc.getFullYear();
    if (idade < 13 || idade > 120) { setErro('Data de nascimento inválida.'); return false; }
    return true;
  }

  function validarStep3(): boolean {
    const ddiClean = ddi.replace(/\D/g, '');
    const dddClean = ddd.replace(/\D/g, '');
    const phoneClean = phoneNumber.replace(/\D/g, '');
    
    if (!ddi.trim().startsWith('+')) { setErro('O DDI deve começar com + (ex: +55).'); return false; }
    if (ddiClean.length < 1) { setErro('Informe o DDI.'); return false; }
    
    if (isBrasil) {
      if (dddClean.length !== 2) { setErro('Informe o DDD com 2 dígitos.'); return false; }
      if (phoneClean.length !== 9) { setErro('Informe o número com 9 dígitos (começando com 9).'); return false; }
      const fullPhone = dddClean + phoneClean;
      if (!isValidPhone(fullPhone)) { setErro('Número inválido. O celular brasileiro deve ter 9 dígitos começando com 9.'); return false; }
    } else {
      if (phoneClean.length < 7) { setErro('Informe um número de telefone válido.'); return false; }
    }
    
    if (!isValidCpf(cpf)) { setErro('CPF inválido.'); return false; }
    return true;
  }

  function validarStep4(): boolean {
    if (!isGoogleMode) {
      if (!email.trim()) { setErro('Informe o e-mail.'); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('E-mail inválido.'); return false; }
      if (password.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return false; }
      if (password !== confirmPassword) { setErro('As senhas não conferem.'); return false; }
    }
    if (!senhaCasa.trim()) { setErro('Informe a senha da casa.'); return false; }
    return true;
  }

  async function verificarSenhaCasa(): Promise<{ ok: boolean; houseId?: string; nomeCasa?: string }> {
    try {
      const q = query(collection(db, 'casas'), where('senhaCadastro', '==', senhaCasa.trim()));
      const snap = await getDocs(q);
      if (snap.empty) return { ok: false };
      const casa = snap.docs[0];
      return { ok: true, houseId: casa.id, nomeCasa: casa.data().nome || 'Casa' };
    } catch (e) {
      return { ok: false };
    }
  }

  async function handleCancelar() {
    // Se estiver no modo Google, faz signOut para não deixar o usuário em estado inconsistente
    if (isGoogleMode) {
      try { await auth.signOut(); } catch { /* silent */ }
      const { setUser } = useAuthStore.getState();
      setUser(null);
    }
    navigate('/login');
  }

  async function handleCadastrar() {
    setLoading(true); setErro(''); setSucesso('');
    try {
      const casaResult = await verificarSenhaCasa();
      if (!casaResult.ok) {
        setErro('Senha da casa incorreta. Verifique com algum morador da casa.');
        setLoading(false);
        return;
      }

      const ddiClean = ddi.replace(/\D/g, '');
      const dddClean = ddd.replace(/\D/g, '');
      const phoneClean = phoneNumber.replace(/\D/g, '');
      const fullPhone = isBrasil ? `${ddiClean}${dddClean}${phoneClean}` : `${ddiClean}${phoneClean}`;

      if (isGoogleMode) {
        // Modo Google: usuário já está autenticado
        const currentUser = auth.currentUser;
        if (!currentUser) { setErro('Usuário não autenticado'); setLoading(false); return; }

        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          name: name.trim() || authUser?.name || currentUser.displayName || '',
          fullName: fullName.trim(),
          pronome,
          email: currentUser.email || '',
          phone: fullPhone,
          birthDate,
          cpf: cpf.replace(/\D/g, ''),
          pixKey: pixKey.trim() || '',
          houseId: casaResult.houseId || '',
          role: 'hospede',
          isActive: true,
          isPresent: true,
          photoURL: currentUser.photoURL || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Atualiza o store local
        const { setUser } = useAuthStore.getState();
        setUser({
          uid: currentUser.uid,
          email: currentUser.email || '',
          name: name.trim() || authUser?.name || currentUser.displayName || '',
          fullName: fullName.trim(),
          role: 'hospede',
          isActive: true,
          isPresent: true,
          phone: fullPhone,
          cpf: cpf.replace(/\D/g, ''),
          pixKey: pixKey.trim() || '',
          photoURL: currentUser.photoURL || '',
          houseId: casaResult.houseId || '',
        });

        setSucesso(`${c.bemVindo} ao Caule! Você está ${c.vinculada} à ${casaResult.nomeCasa}.`);
        setTimeout(() => navigate('/app'), 2000);
      } else {
        // Modo normal: cria usuário com email/senha
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(userCredential.user, { displayName: name.trim() });

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          name: name.trim(),
          fullName: fullName.trim(),
          pronome,
          email: email.trim(),
          phone: fullPhone,
          birthDate,
          cpf: cpf.replace(/\D/g, ''),
          pixKey: pixKey.trim() || '',
          houseId: casaResult.houseId || '',
          role: 'hospede',
          isActive: true,
          isPresent: true,
          photoURL: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        setSucesso(`${c.bemVindo} ao Caule! Sua conta foi criada e você está ${c.vinculada} à ${casaResult.nomeCasa}.`);
        setTimeout(() => navigate('/login'), 3000);
      }
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') setErro('Este e-mail já está cadastrado.');
      else if (e.code === 'auth/invalid-email') setErro('E-mail inválido.');
      else setErro(e.message || 'Erro ao criar conta. Tente novamente.');
    }
    setLoading(false);
  }

  const steps = isGoogleMode
    ? [
        { label: 'Identidade', icon: 'diversity_3' },
        { label: 'Dados', icon: 'badge' },
        { label: 'Contato', icon: 'phone' },
      ]
    : [
        { label: 'Identidade', icon: 'diversity_3' },
        { label: 'Dados', icon: 'badge' },
        { label: 'Contato', icon: 'phone' },
        { label: 'Acesso', icon: 'lock' },
      ];

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md">
      <TopAppBar title="Cadastro" showAvatar={false} showMenu={false} showNotifications={false} />

      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* Header */}
        <div className="relative">
          <button
            onClick={handleCancelar}
            className="absolute -top-2 -right-2 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-all"
            title="Cancelar e voltar ao login"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {isGoogleMode ? 'Completar Perfil' : 'Criar Conta'}
          </h2>
          <p className="text-on-surface-variant font-body-md mt-1">{c.bemVindo} ao Caule! Vamos começar.</p>
        </div>

        {/* Progresso */}
        <div className="flex gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-2 rounded-full ${i + 1 <= step ? 'bg-primary' : 'bg-surface-container-high'}`} />
              <span className={`text-[10px] ${i + 1 <= step ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Mensagens */}
        {erro && (
          <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>{erro}
          </div>
        )}
        {sucesso && (
          <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}
          </div>
        )}

        {/* Etapa 1: Identidade (Pronome + Apelido) */}
        {step === 1 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">diversity_3</span>Quem é você?
            </h3>

            {/* Pronome */}
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-2 font-bold">Pronome *</label>
              <div className="flex gap-2">
                {(['ela', 'ele', 'elu'] as Pronome[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPronome(p); limparErro(); }}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm capitalize transition-all border-2 ${
                      pronome === p
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-high text-on-surface border-outline-variant hover:border-primary/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Apelido */}
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">
                Como quer ser {c.chamado}? *
              </label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); limparErro(); }}
                placeholder="Ex: Carol, Lucas, João..."
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">Este é o nome que o app usará para se referir a você.</p>
            </div>

            <button
              onClick={() => { if (validarStep1()) setStep(2); }}
              className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all"
            >
              Próximo
            </button>
          </div>
        )}

        {/* Etapa 2: Dados Pessoais */}
        {step === 2 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">badge</span>Dados Pessoais
            </h3>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Nome Completo *</label>
              <input
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); limparErro(); }}
                placeholder="Nome e sobrenome"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data de Nascimento *</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => { setBirthDate(e.target.value); limparErro(); }}
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all"
              >
                Voltar
              </button>
              <button
                onClick={() => { if (validarStep2()) setStep(3); }}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3: Contato (Telefone, CPF, PIX) */}
        {step === 3 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">phone</span>Contato
            </h3>

            {/* Telefone com DDI e DDD */}
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Celular *</label>
              <div className="flex gap-2">
                <input
                  value={ddi}
                  onChange={(e) => { 
                    const val = e.target.value;
                    if (val === '' || val.startsWith('+')) setDdi(val); 
                    else setDdi('+' + val.replace(/^\+/, ''));
                    limparErro(); 
                  }}
                  placeholder="+55"
                  className="w-20 bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-2 text-sm text-center"
                />
                {isBrasil && (
                  <input
                    value={ddd}
                    onChange={(e) => { setDdd(e.target.value.replace(/\D/g, '').slice(0, 2)); limparErro(); }}
                    placeholder="DDD"
                    className="w-16 bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-2 text-sm text-center"
                  />
                )}
                <input
                  value={isBrasil ? formatPhoneNumberOnly(phoneNumber) : phoneNumber}
                  onChange={(e) => { 
                    const raw = e.target.value.replace(/\D/g, '');
                    setPhoneNumber(raw); 
                    limparErro(); 
                  }}
                  placeholder={isBrasil ? '9 9999-9999' : 'Número'}
                  className="flex-1 bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
                />
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1">
                {isBrasil ? 'Formato brasileiro: DDI + DDD + número' : 'DDI internacional: apenas DDI + número'}
              </p>
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">CPF *</label>
              <input
                value={formatCpf(cpf)}
                onChange={(e) => { setCpf(e.target.value); limparErro(); }}
                placeholder="000.000.000-00"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
            </div>

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Chave PIX</label>
              <input
                value={pixKey}
                onChange={(e) => { setPixKey(e.target.value); limparErro(); }}
                placeholder="CPF, e-mail, celular ou chave aleatória"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all"
              >
                Voltar
              </button>
              <button
                onClick={() => { if (validarStep3()) setStep(4); }}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Etapa 4: Acesso (Email, Senha, Senha da Casa) */}
        {step === 4 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock</span>
              {isGoogleMode ? 'Vincular à Casa' : 'Acesso'}
            </h3>

            {!isGoogleMode && (
              <>
                <div>
                  <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">E-mail *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); limparErro(); }}
                    placeholder="seu@email.com"
                    className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Senha *</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); limparErro(); }}
                      placeholder="Mín. 6 caracteres"
                      className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Confirmar *</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); limparErro(); }}
                      placeholder="Repita a senha"
                      className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            {isGoogleMode && authUser?.email && (
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">E-mail</label>
                <input
                  type="email"
                  value={authUser.email}
                  disabled
                  className="w-full bg-surface-container-high border-2 border-outline-variant text-on-surface rounded-xl py-3 px-4 text-sm opacity-60"
                />
              </div>
            )}

            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Senha da Casa *</label>
              <input
                type="text"
                value={senhaCasa}
                onChange={(e) => { setSenhaCasa(e.target.value); limparErro(); }}
                placeholder="Peça a senha para algum morador da casa"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                A senha da casa vincula sua conta automaticamente. Sem ela, você não conseguirá usar o app.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all"
              >
                Voltar
              </button>
              <button
                onClick={() => { if (validarStep4()) handleCadastrar(); }}
                disabled={loading}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
              >
                {loading ? 'Salvando...' : isGoogleMode ? 'Finalizar' : 'Criar Conta'}
              </button>
            </div>
          </div>
        )}

        {/* Link para login / cancelar */}
        <div className="text-center space-y-2">
          <p className="text-caption text-on-surface-variant">
            {isGoogleMode ? 'Não quer continuar?' : 'Já tem conta?'}{' '}
            <button onClick={handleCancelar} className="text-primary font-bold hover:underline">
              {isGoogleMode ? 'Cancelar e voltar ao login' : 'Fazer Login'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
