const fs = require('fs');

const svg = fs.readFileSync('public/assets/logo.svg', 'utf8');

// Extract stem paths
const stemMatch = svg.match(/<g id="caule-stem">([\s\S]*?)<\/g>/);
const stemPaths = stemMatch ? [...stemMatch[1].matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)] : [];

// Extract orange and split
const orangeMatch = svg.match(/<g id="petal-orange">([\s\S]*?)<\/g>/);
const orangeData = orangeMatch ? [...orangeMatch[1].matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)] : [];
let orangeSubpaths = [];
if (orangeData.length > 0) {
  const d = orangeData[0][1];
  const fill = orangeData[0][2];
  const parts = d.split(/ZM\s+/);
  parts.forEach((part, i) => {
    let pathD = i === 0 ? part.trim() : 'M ' + part.trim();
    orangeSubpaths.push({ d: pathD, fill });
  });
}
orangeSubpaths.sort((a, b) => b.d.length - a.d.length);
const topOrange = orangeSubpaths.slice(0, 3);

// Extract blue paths
const blueMatch = svg.match(/<g id="petal-blue">([\s\S]*?)<\/g>/);
const bluePathsRaw = blueMatch ? [...blueMatch[1].matchAll(/<path d="([^"]+)"(?:\s+fill="([^"]+)")?/g)] : [];
const bluePaths = bluePathsRaw.map(p => ({ d: p[1], fill: p[2] || 'rgb(3,59,157)' }));

const stemSvg = stemPaths.map(p => `              <path d="${p[1]}" fill="${p[2]}" />`).join('\n');
const orangeSvg = topOrange.map(p => `              <path d="${p.d}" fill="${p.fill}" />`).join('\n');
const blueSvg = bluePaths.map(p => `              <path d="${p.d}" fill="${p.fill}" />`).join('\n');

const tsx = `import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 5200);
    const t2 = setTimeout(() => onComplete?.(), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div className={\`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0c1322] transition-opacity duration-700 ease-in-out \${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}\`}>
      <style>{\`
        @keyframes seedPulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes seedFade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes rippleExpand {
          0% { transform: scale(1); opacity: 0.7; border-width: 3px; }
          50% { opacity: 0.3; }
          100% { transform: scale(6); opacity: 0; border-width: 0px; }
        }
        @keyframes radialExpand {
          0% { opacity: 0; transform: scale(0.05); }
          20% { opacity: 1; }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes petalFromCenter {
          0% { opacity: 0; transform: scale(0.1); }
          60% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bluePetalFromCenter {
          0% { opacity: 0; transform: scale(0.1) rotate(-10deg); }
          60% { opacity: 1; transform: scale(1.05) rotate(2deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .splash-seed {
          animation: seedPulse 0.8s ease-in-out 2;
        }
        .splash-seed-fade {
          animation: seedFade 0.3s ease-out forwards;
          animation-delay: 1.4s;
        }
        .splash-ripple-1 {
          animation: rippleExpand 0.8s ease-out forwards;
          animation-delay: 0.6s;
        }
        .splash-ripple-2 {
          animation: rippleExpand 0.8s ease-out forwards;
          animation-delay: 0.9s;
        }
        .splash-ripple-3 {
          animation: rippleExpand 0.8s ease-out forwards;
          animation-delay: 1.2s;
        }
        .splash-stem {
          animation: radialExpand 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          opacity: 0;
          animation-delay: 1.5s;
          transform-origin: 512px 512px;
        }
        .splash-orange-left {
          animation: petalFromCenter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
          animation-delay: 2.5s;
          transform-origin: 512px 512px;
        }
        .splash-orange-mid {
          animation: petalFromCenter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
          animation-delay: 2.8s;
          transform-origin: 512px 512px;
        }
        .splash-orange-right {
          animation: petalFromCenter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
          animation-delay: 3.1s;
          transform-origin: 512px 512px;
        }
        .splash-blue {
          animation: bluePetalFromCenter 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
          animation-delay: 3.7s;
          transform-origin: 512px 512px;
        }
      \`}</style>

      <div className="relative w-[320px] h-[320px] flex items-center justify-center">
        {/* ====== RIPPLE WAVES (seed sprouting) ====== */}
        <div className="absolute inset-0 flex items-center justify-center z-[5]">
          <div className="splash-ripple-1 absolute w-[20px] h-[20px] rounded-full border-[3px] border-[#0D9B63] opacity-0" />
          <div className="splash-ripple-2 absolute w-[20px] h-[20px] rounded-full border-[3px] border-[#0D9B63] opacity-0" />
          <div className="splash-ripple-3 absolute w-[20px] h-[20px] rounded-full border-[3px] border-[#0D9B63] opacity-0" />
        </div>

        {/* ====== SEMENTE ====== */}
        <div className="splash-seed splash-seed-fade absolute w-[20px] h-[20px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#1dd882,#0D9B63)] shadow-[0_0_20px_rgba(13,155,99,0.6)] z-10" />

        {/* ====== LOGO SVG (inline) ====== */}
        <div className="absolute w-[260px] h-[260px]">
          <svg width="260" height="260" viewBox="0 0 1024 1024">
            {/* Caule - nasce do centro e expande radialmente */}
            <g className="splash-stem">
${stemSvg}
            </g>
            {/* 3 Pétalas laranjas - surgem do centro em sequência */}
            <g className="splash-orange-left">
${orangeSvg}
            </g>
            {/* Pétalas azuis - surgem do centro por último */}
            <g className="splash-blue">
${blueSvg}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/SplashScreen.tsx', tsx, 'utf8');
console.log('Generated SplashScreen.tsx');
console.log({ stem: stemPaths.length, orange: topOrange.length, blue: bluePaths.length });
