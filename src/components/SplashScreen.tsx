import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
  duration?: number;
}

export function SplashScreen({ onComplete, duration = 5500 }: SplashScreenProps) {
  const [phase, setPhase] = useState(0); // 0=semente, 1=brotando, 2=caule, 3=folhas, 4=final, 5=saindo
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const phases = [0, 1, 2, 3, 4, 5];
    const interval = duration / phases.length;
    let current = 0;

    const timer = setInterval(() => {
      current++;
      if (current >= phases.length) {
        clearInterval(timer);
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => onComplete?.(), 800);
        }, 200);
        return;
      }
      setPhase(current);
    }, interval);

    return () => clearInterval(timer);
  }, [duration, onComplete]);

  const seedScale = phase === 0 ? 'scale-100' : phase === 1 ? 'scale-150' : 'scale-0';
  const seedOpacity = phase <= 1 ? 'opacity-100' : 'opacity-0';
  const cauleOpacity = phase >= 2 ? 'opacity-100' : 'opacity-0';
  const brilhoOpacity = phase >= 4 ? 'opacity-100' : 'opacity-0';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0c1322] transition-all duration-700 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="relative w-[280px] h-[280px] flex items-center justify-center">

        {/* ========== FASE 0-1: SEMENTE (círculo verde) ========== */}
        <div
          className={`absolute transition-all duration-[1500ms] ease-in-out ${seedScale} ${seedOpacity}`}
          style={{
            width: phase === 0 ? '24px' : phase === 1 ? '48px' : '0px',
            height: phase === 0 ? '24px' : phase === 1 ? '48px' : '0px',
            borderRadius: '50%',
            background: '#065f46',
            boxShadow: phase === 0 ? '0 0 20px rgba(6,95,70,0.6)' : '0 0 40px rgba(6,95,70,0.8)',
            transform: phase === 1 ? 'scaleY(1.6) translateY(-20px)' : 'scaleY(1) translateY(0)',
          }}
        />

        {/* ========== FASE 2-5: CAULE (o C do Caule) ========== */}
        <svg
          viewBox="0 0 1024 1024"
          className={`absolute w-[260px] h-[260px] transition-opacity duration-1000 ${cauleOpacity}`}
        >
          {/* Curva externa do C - cresce lentamente */}
          <path
            d="M 736 680 C 824 560, 824 448, 736 360 C 648 272, 504 272, 400 360 C 296 448, 240 560, 240 680 C 240 824, 352 936, 512 936 C 624 936, 712 880, 736 820"
            stroke="url(#cExtGrad)"
            strokeWidth="72"
            strokeLinecap="round"
            fill="none"
            style={{
              strokeDasharray: 2200,
              strokeDashoffset: phase >= 2 ? 0 : 2200,
              transition: 'stroke-dashoffset 2.5s ease-in-out',
            }}
          />
          {/* Curva interna do C */}
          <path
            d="M 680 680 C 752 576, 752 480, 680 408 C 608 336, 504 336, 416 408 C 328 480, 288 576, 288 680 C 288 792, 384 872, 512 872 C 600 872, 664 832, 680 792"
            stroke="url(#cIntGrad)"
            strokeWidth="40"
            strokeLinecap="round"
            fill="none"
            style={{
              strokeDasharray: 1800,
              strokeDashoffset: phase >= 2 ? 0 : 1800,
              transition: 'stroke-dashoffset 2.5s ease-in-out 0.3s',
            }}
          />

          {/* Gradientes inline para o SVG */}
          <defs>
            <linearGradient id="cExtGrad" x1="200" y1="512" x2="824" y2="512">
              <stop offset="0%" stopColor="#087a4a"/>
              <stop offset="50%" stopColor="#0A8554"/>
              <stop offset="100%" stopColor="#0D9B63"/>
            </linearGradient>
            <linearGradient id="cIntGrad" x1="280" y1="512" x2="744" y2="512">
              <stop offset="0%" stopColor="#0D9B63"/>
              <stop offset="100%" stopColor="#10B981"/>
            </linearGradient>
            <linearGradient id="folhaGrad" x1="600" y1="300" x2="900" y2="400">
              <stop offset="0%" stopColor="#0D9B63"/>
              <stop offset="100%" stopColor="#059669"/>
            </linearGradient>
            <linearGradient id="laranja1Grad" x1="300" y1="200" x2="150" y2="350">
              <stop offset="0%" stopColor="#FB923C"/>
              <stop offset="100%" stopColor="#F97316"/>
            </linearGradient>
            <linearGradient id="laranja2Grad" x1="400" y1="180" x2="280" y2="360">
              <stop offset="0%" stopColor="#FDBA74"/>
              <stop offset="100%" stopColor="#FB923C"/>
            </linearGradient>
            <linearGradient id="vermelhoGrad" x1="460" y1="160" x2="400" y2="380">
              <stop offset="0%" stopColor="#FCA5A5"/>
              <stop offset="100%" stopColor="#EF4444"/>
            </linearGradient>
            <linearGradient id="azulGrad" x1="520" y1="320" x2="620" y2="280">
              <stop offset="0%" stopColor="#60A5FA"/>
              <stop offset="100%" stopColor="#2563EB"/>
            </linearGradient>
          </defs>

          {/* ========== FASE 3-5: FOLHAS/PÉTALAS ========== */}
          {/* Folha verde (direita) */}
          <path
            d="M 440 360 C 520 280, 640 240, 800 280 C 680 320, 600 360, 560 400 C 520 440, 480 440, 440 400 C 420 380, 430 370, 440 360Z"
            fill="url(#folhaGrad)"
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'scale(1)' : 'scale(0.3)',
              transformOrigin: '440px 360px',
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0s',
            }}
          />
          {/* Pétala laranja escura (esquerda) */}
          <path
            d="M 420 360 C 380 280, 320 200, 200 160 C 280 240, 340 320, 360 380 C 380 440, 400 420, 420 400 C 440 380, 430 370, 420 360Z"
            fill="url(#laranja1Grad)"
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'scale(1)' : 'scale(0.3)',
              transformOrigin: '420px 360px',
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s',
            }}
          />
          {/* Pétala laranja (centro-esquerda) */}
          <path
            d="M 450 350 C 440 280, 420 200, 340 120 C 380 200, 400 280, 410 340 C 420 400, 440 390, 450 370 C 460 360, 455 355, 450 350Z"
            fill="url(#laranja2Grad)"
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'scale(1)' : 'scale(0.3)',
              transformOrigin: '450px 350px',
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s',
            }}
          />
          {/* Pétala vermelha (centro) */}
          <path
            d="M 470 340 C 468 260, 460 180, 440 100 C 448 180, 452 260, 454 320 C 456 380, 465 370, 470 360 C 475 350, 472 345, 470 340Z"
            fill="url(#vermelhoGrad)"
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'scale(1)' : 'scale(0.3)',
              transformOrigin: '470px 340px',
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.6s',
            }}
          />
          {/* Pétala azul (centro-direita) */}
          <path
            d="M 490 350 C 520 300, 560 260, 640 240 C 580 280, 540 320, 520 360 C 500 400, 490 380, 485 370 C 480 360, 485 355, 490 350Z"
            fill="url(#azulGrad)"
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'scale(1)' : 'scale(0.3)',
              transformOrigin: '490px 350px',
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s',
            }}
          />
        </svg>

        {/* ========== FASE 4-5: BRILHO FINAL ========== */}
        <div
          className={`absolute w-[300px] h-[300px] rounded-full border-2 border-[#0D9B63]/20 transition-all duration-[1500ms] ease-out ${brilhoOpacity}`}
          style={{
            transform: phase >= 4 ? 'scale(1.3)' : 'scale(0.8)',
            boxShadow: phase >= 4 ? '0 0 60px rgba(13,155,99,0.15), inset 0 0 40px rgba(13,155,99,0.05)' : 'none',
          }}
        />

        {/* Texto "Caule" aparece no final */}
        <div
          className={`absolute -bottom-10 transition-all duration-1000 ease-out ${
            phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: phase >= 4 ? '0.5s' : '0s' }}
        >
          <span className="text-3xl font-bold tracking-[0.3em]" style={{ color: '#4edea3' }}>Caule</span>
        </div>
      </div>
    </div>
  );
}
