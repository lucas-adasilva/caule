import { Sidebar } from './Sidebar';

interface EmDesenvolvimentoProps {
  titulo: string;
  subtitulo: string;
  emoji?: string;
}

export function EmDesenvolvimento({ titulo, subtitulo, emoji = '🌱' }: EmDesenvolvimentoProps) {
  return (
    <div className="flex min-h-screen bg-gray-900">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto mt-20">
          {/* Ícone grande */}
          <div className="text-center mb-8">
            <span className="text-7xl">{emoji}</span>
          </div>

          {/* Card principal */}
          <div className="bg-gray-800 rounded-3xl border border-gray-700 p-10 text-center relative overflow-hidden">
            {/* Decoração de fundo */}
            <div className="absolute inset-0 opacity-5">
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <path d="M100 20 Q60 60 100 100 Q140 140 100 180" stroke="#98D8C8" strokeWidth="2" fill="none"/>
                <path d="M100 40 Q70 70 100 100 Q130 130 100 160" stroke="#98D8C8" strokeWidth="1" fill="none"/>
              </svg>
            </div>

            <div className="relative">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-page-sementes/20 rounded-full mb-6">
                <div className="w-2 h-2 bg-page-sementes rounded-full animate-pulse" />
                <span className="text-page-sementes text-sm font-medium">Em desenvolvimento</span>
              </div>

              {/* Título */}
              <h1 className="text-4xl font-bold text-page-sementes mb-4">{titulo}</h1>

              {/* Subtítulo */}
              <p className="text-xl text-gray-400 mb-8">{subtitulo}</p>

              {/* Mensagem */}
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <p className="text-gray-300 text-base leading-relaxed">
                  Estamos cultivando esta sessão com carinho! 🌿
                </p>
                <p className="text-gray-500 text-sm mt-3">
                  Em breve voc&#xea; poder&#xe1; aproveitar tudo o que estamos preparando por aqui.
                </p>
              </div>

              {/* Progresso estilizado */}
              <div className="mt-8 flex items-center justify-center gap-3">
                <div className="w-3 h-3 bg-page-sementes rounded-full" />
                <div className="w-3 h-3 bg-page-sementes/60 rounded-full" />
                <div className="w-3 h-3 bg-page-sementes/30 rounded-full" />
                <div className="w-3 h-3 bg-gray-700 rounded-full" />
                <div className="w-3 h-3 bg-gray-700 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
