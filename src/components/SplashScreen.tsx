import { useEffect, useState, useRef } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(true);
  const totalPhases = 7;
  const phaseDuration = 900; // ms por fase = ~6.3s total
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let current = 0;

    timerRef.current = setInterval(() => {
      current++;
      if (current >= totalPhases) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase(current);
        // Espera a última fase terminar antes de sair
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => onComplete?.(), 800);
        }, 400);
        return;
      }
      setPhase(current);
    }, phaseDuration);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onComplete]);

  // Fase 0 = semente (círculo verde)
  // Fase 1 = semente brotando (alonga)
  // Fase 2 = broto crescendo
  // Fase 3 = logo aparecendo (só caule/verde)
  // Fase 4 = logo com pétalas brotando
  // Fase 5 = logo completo + brilho
  // Fase 6 = texto + fade out

  const showSeed = phase <= 2;
  const showLogo = phase >= 3;
  const logoBloom = phase >= 4;
  const showGlow = phase >= 5;
  const showText = phase >= 6;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0c1322] transition-opacity duration-700 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="relative w-[280px] h-[280px] flex items-center justify-center">

        {/* ====== SEMENTE (fases 0-2) ====== */}
        {showSeed && (
          <div
            className="absolute transition-all duration-[900ms] ease-in-out"
            style={{
              width: phase === 0 ? '20px' : phase === 1 ? '28px' : '36px',
              height: phase === 0 ? '20px' : phase === 1 ? '50px' : '80px',
              borderRadius: phase === 0 ? '50%' : '50% 50% 50% 50% / 60% 60% 40% 40%',
              background: phase === 0 ? '#065f46' : phase === 1 ? '#0A8554' : '#0D9B63',
              boxShadow: `0 0 ${phase === 0 ? 16 : 32}px rgba(13,155,99,${phase === 0 ? 0.5 : 0.7})`,
              opacity: phase <= 2 ? 1 : 0,
              transform: `scale(${phase === 0 ? 1 : phase === 1 ? 1.2 : 1.5}) translateY(${phase === 2 ? -10 : 0}px)`,
              transition: 'all 900ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* ====== LOGO SVG (fases 3+) ====== */}
        {showLogo && (
          <div
            className="absolute flex items-center justify-center transition-all duration-1000 ease-out"
            style={{
              opacity: showLogo ? 1 : 0,
              transform: `scale(${logoBloom ? 1 : 0.35})`,
              transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              width: '240px',
              height: '240px',
            }}
          >
            <img
              src="/assets/logo.svg"
              alt="Caule"
              className="w-full h-full object-contain"
              style={{
                filter: showGlow ? 'drop-shadow(0 0 20px rgba(13,155,99,0.4))' : 'none',
                transition: 'filter 1s ease-out',
              }}
            />
          </div>
        )}

        {/* ====== BRILHO AO REDOR (fase 5+) ====== */}
        {showGlow && (
          <div
            className="absolute rounded-full border border-[#0D9B63]/20 transition-all duration-[1500ms] ease-out"
            style={{
              width: '280px',
              height: '280px',
              opacity: 0.6,
              transform: 'scale(1.15)',
              boxShadow: '0 0 60px rgba(13,155,99,0.12), inset 0 0 40px rgba(13,155,99,0.06)',
            }}
          />
        )}

        {/* ====== TEXTO "CAULE" (fase 6) ====== */}
        <div
          className={`absolute -bottom-10 transition-all duration-700 ease-out ${
            showText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <span className="text-3xl font-bold tracking-[0.3em]" style={{ color: '#4edea3' }}>
            Caule
          </span>
        </div>
      </div>
    </div>
  );
}
