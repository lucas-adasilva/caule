import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { TopAppBar } from '@/components/TopAppBar';

const PERGUNTA_RESPOSTA = 'perguntaproabacate';

export function CadastroPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Campos que o usuario preenche (baseado nos campos reais do Firestore)
  const [form, setForm] = useState({
    name: '',           // nome/apelido
    email: '',          // email
    password: '',       // senha
    confirmPassword: '',// confirmar senha
    fullName: '',       // nome completo
    phone: '',          // telefone
    birthDate: '',      // data nascimento
    cpf: '',            // CPF
    pixKey: '',         // chave pix
    pergunta: '',       // resposta da pergunta secreta
  });

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErro('');
  }

  function validarPergunta() {
    if (form.pergunta.trim().toLowerCase() !== PERGUNTA_RESPOSTA) {
      setErro('Resposta incorreta.');
      return false;
    }
    return true;
  }

  async function handleCadastrar() {
    if (form.password !== form.confirmPassword) { setErro('As senhas nao conferem'); return; }
    if (form.password.length < 6) { setErro('Senha deve ter no minimo 6 caracteres'); return; }
    if (!form.name.trim() || !form.email.trim() || !form.fullName.trim()) { setErro('Preencha todos os campos obrigatorios'); return; }

    setLoading(true); setErro(''); setSucesso('');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(userCredential.user, { displayName: form.name });

      // Salva no Firestore com TODOS os campos do schema
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        // Campos do usuario
        name: form.name,
        email: form.email,
        fullName: form.fullName,
        phone: form.phone || '',
        birthDate: form.birthDate || '',
        cpf: form.cpf || '',
        pixKey: form.pixKey || '',
        // Campos do sistema
        uid: userCredential.user.uid,
        houseId: '',           // vazio - vincula depois
        role: 'morador',       // padrao
        isActive: true,        // ativo
        isPresent: true,       // presente
        photoURL: '',          // vazio - upload depois
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setSucesso('Cadastro realizado! Faca login para continuar.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (e: any) {
      setErro(e.code === 'auth/email-already-in-use' ? 'Este email já está cadastrado' : e.code === 'auth/invalid-email' ? 'Email inválido' : e.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-surface text-text-body font-body-md">
      <TopAppBar title="Cadastro" showAvatar={false} showMenu={false} showNotifications={false} />

      <main className="px-margin-page mt-stack-md space-y-6 pb-10">
        {/* Header */}
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Criar Conta</h2>
          <p className="text-text-muted font-body-md mt-1">Preencha seus dados para ingressar no Caule</p>
        </div>

        {/* Progresso */}
        <div className="flex gap-2">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-surface-container-high'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-surface-container-high'}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 3 ? 'bg-primary' : 'bg-surface-container-high'}`} />
        </div>

        {/* Mensagens */}
        {erro && <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">error</span>{erro}</div>}
        {sucesso && <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm flex items-center gap-2"><span className="material-symbols-outlined text-sm">check_circle</span>{sucesso}</div>}

        {/* Etapa 1: Conta (obrigatorio) */}
        {step === 1 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">person</span>Dados da Conta *</h3>
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Nome / Apelido *</label>
              <input value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Como quer ser chamado"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
            </div>
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">E-mail *</label>
              <input value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="seu@email.com" type="email"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Senha *</label>
                <input value={form.password} onChange={e => updateField('password', e.target.value)} placeholder="Min 6 chars" type="password"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Confirmar *</label>
                <input value={form.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} placeholder="Repita" type="password"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
            </div>
            <button onClick={() => setStep(2)} className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all">Proximo</button>
          </div>
        )}

        {/* Etapa 2: Dados Pessoais (opcional) */}
        {step === 2 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-primary">badge</span>Dados Pessoais</h3>
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Nome Completo *</label>
              <input value={form.fullName} onChange={e => updateField('fullName', e.target.value)} placeholder="Seu nome completo"
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Telefone</label>
                <input value={form.phone} onChange={e => updateField('phone', e.target.value)} placeholder="11999998888"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Data Nasc.</label>
                <input value={form.birthDate} onChange={e => updateField('birthDate', e.target.value)} type="date"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">CPF</label>
                <input value={form.cpf} onChange={e => updateField('cpf', e.target.value)} placeholder="000.000.000-00"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
              <div>
                <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Chave PIX</label>
                <input value={form.pixKey} onChange={e => updateField('pixKey', e.target.value)} placeholder="CPF, email ou celular"
                  className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all">Voltar</button>
              <button onClick={() => setStep(3)} className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all">Proximo</button>
            </div>
          </div>
        )}

        {/* Etapa 3: Pergunta Secreta (oculto) */}
        {step === 3 && (
          <div className="bg-surface-card rounded-xl border border-outline-variant p-4 space-y-4">
            <h3 className="font-bold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-tertiary">verified</span>Validacao</h3>
            <div className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 text-center space-y-2">
              <span className="material-symbols-outlined text-tertiary text-3xl">help_outline</span>
              <p className="text-sm text-on-surface font-bold">Pergunta de seguranca</p>
              <p className="text-sm text-on-surface-variant">Voce precisa da frase secreta para se cadastrar. Peça a um morador da casa.</p>
            </div>
            <div>
              <label className="text-label-sm text-on-surface-variant block mb-1 font-bold">Frase Secreta *</label>
              <input value={form.pergunta} onChange={e => updateField('pergunta', e.target.value)} placeholder="Digite a frase aqui..."
                className="w-full bg-surface-container-high border-2 border-outline-variant focus:border-primary text-on-surface rounded-xl py-3 px-4 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 bg-surface-container text-on-surface border border-outline-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all">Voltar</button>
              <button onClick={() => { if (validarPergunta()) handleCadastrar(); }} disabled={loading}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
                {loading ? 'Cadastrando...' : 'Criar Conta'}
              </button>
            </div>
          </div>
        )}

        {/* Link para login */}
        <div className="text-center">
          <p className="text-caption text-on-surface-variant">Ja tem conta? <button onClick={() => navigate('/login')} className="text-primary font-bold hover:underline">Fazer Login</button></p>
        </div>
      </main>
    </div>
  );
}
