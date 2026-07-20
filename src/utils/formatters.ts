// ===== FORMATAÇÃO =====

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  if (cleaned.length <= 10) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
}

/** Formata apenas o número do celular (sem DDD): 9 9999-9999 */
export function formatPhoneNumberOnly(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length <= 1) return cleaned;
  if (cleaned.length <= 5) return `${cleaned.slice(0, 1)} ${cleaned.slice(1)}`;
  return `${cleaned.slice(0, 1)} ${cleaned.slice(1, 5)}-${cleaned.slice(5, 9)}`;
}

/** Formata telefone completo (com DDI já incluso no valor salvo): +55 (11) 9 9999-9999 */
export function formatPhoneCompleto(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  // Brasil: 55 + DDD (2) + celular (9) = 13 digitos
  if (cleaned.startsWith('55') && cleaned.length === 13) {
    const ddd = cleaned.slice(2, 4);
    const numero = cleaned.slice(4);
    return `+55 (${ddd}) ${formatPhoneNumberOnly(numero)}`;
  }
  // Internacional generico: assume os ultimos 8 digitos como numero local
  if (cleaned.length > 8) {
    const ddi = cleaned.slice(0, cleaned.length - 8);
    const numero = cleaned.slice(-8);
    return `+${ddi} ${numero.slice(0, 4)}-${numero.slice(4)}`;
  }
  return `+${cleaned}`;
}

/** Formata data no formato YYYY-MM-DD (input type=date) para DD/MM/AAAA - split de string evita
 *  o bug classico de `new Date('YYYY-MM-DD')` interpretar como UTC e voltar um dia em fusos negativos. */
export function formatDateBr(dataIso?: string): string {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

export function formatCpf(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length > 11) return cleaned.slice(0, 11);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
  if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
  return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
}

// ===== SUGESTÃO DE EMOJI PARA CÔMODOS =====

const emojiMap: Record<string, string> = {
  quarto: '🛏️', dormitorio: '🛏️', suite: '🛏️', cama: '🛏️', descanso: '🛏️',
  banheiro: '🚿', wc: '🚿', sanitario: '🚿', toalete: '🚿', banho: '🛁', hidro: '🛁',
  cozinha: '🍳', fogao: '🍳', geladeira: '🍳', cooktop: '🍳', cozinhar: '🍳', panela: '🍳',
  sala: '🛋️', estar: '🛋️', tv: '📺', televisao: '📺', cinema: '🎬', home: '🛋️',
  jardim: '🌿', quintal: '🌿', planta: '🪴', horta: '🌱', externo: '🌿', varanda: '☀️',
  lavanderia: '🧺', lavar: '🧺', roupa: '👕', secadora: '🧺', tanque: '🧺',
  escritorio: '📚', trabalho: '💼', estudo: '📖', notebook: '💻', pc: '🖥️', computador: '💻',
  academia: '🏋️', ginastica: '🏋️', musculacao: '🏋️', fitness: '🏋️', esteira: '🏃', corrida: '🏃',
  jogos: '🎮', videogame: '🎮', playstation: '🎮', xbox: '🎮', nintendo: '🎮', game: '🎮',
  garagem: '🚗', carro: '🚗', moto: '🏍️', estacionamento: '🅿️', oficina: '🔧',
  pet: '🐶', cachorro: '🐕', gato: '🐈', animal: '🐾', aquario: '🐠', passaro: '🦜',
  terraco: '☀️', sacada: '☀️', vista: '🌅', lareira: '🔥', sala_jantar: '🍽️',
  corredor: '🚶', hall: '🚪', entrada: '🚪', portao: '🚪', porteira: '🚪',
  despensa: '🥫', estoque: '📦', adegas: '🍷', vinho: '🍷', bebidas: '🍷',
  piscina: '🏊', spa: '💆', sauna: '♨️', churrasqueira: '🍖', forno: '🍕', lazer: '🎯',
  biblioteca: '📚', leitura: '📖', livro: '📚', arquivo: '🗄️',
  copa: '🍵', cafe: '☕', cha: '🍵', bebida: '🥤',
  deposito: '📦', guardado: '🗄️', arrumacao: '🧹', limpeza: '🧹', vassoura: '🧹',
  escada: '🪜', elevador: '🛗', sotao: '🕸️', porao: '🪨', subsolo: '🪨',
  closet: '👗', vestiario: '👔', provador: '👗',
};

export function suggestEmoji(nome: string): string {
  const normalized = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = normalized.split(/\s+/);
  
  for (const word of words) {
    // Verifica palavra exata
    if (emojiMap[word]) return emojiMap[word];
    // Verifica se alguma chave está contida na palavra
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (word.includes(key)) return emoji;
    }
  }
  
  return '🏠'; // fallback
}

// ===== VALIDAÇÃO =====

export function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Celular brasileiro: 11 dígitos começando com 9 (ex: 11999999999)
  return cleaned.length === 11 && cleaned[2] === '9';
}

export function isValidCpf(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;

  // CPFs inválidos conhecidos
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== parseInt(cleaned[9])) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  if (check2 !== parseInt(cleaned[10])) return false;

  return true;
}

/** Detecta o tipo da chave Pix (CPF, celular, email ou aleatoria) e formata pra exibicao.
 *  CPF e celular sem DDI tem os dois 11 digitos - usa o digito verificador do CPF pra desempatar. */
export function formatPixKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed; // email
  const cleaned = trimmed.replace(/\D/g, '');
  if (cleaned.length === 11 && isValidCpf(cleaned)) return formatCpf(cleaned);
  if (cleaned.length === 10 || cleaned.length === 11) return formatPhone(cleaned);
  if (cleaned.length === 12 || cleaned.length === 13) return formatPhoneCompleto(cleaned);
  return trimmed; // chave aleatoria - mantem como esta
}

// ===== SANITIZAÇÃO =====

export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function cleanPixKey(key: string): string {
  return key.trim();
}