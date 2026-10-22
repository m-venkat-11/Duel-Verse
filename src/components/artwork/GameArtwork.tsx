import React from 'react';

interface GameArtworkProps {
  gameId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export const GameArtwork: React.FC<GameArtworkProps> = ({
  gameId,
  className = '',
  size = 'md'
}) => {
  const getIllustration = () => {
    switch (gameId) {
      // 1. Obstacle Rush (Flagship course runner)
      case 'obstaclerush':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="obs-bg" x1="0" y1="0" x2="0" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1E112A" />
                <stop offset="1" stopColor="#0B0914" />
              </linearGradient>
              <linearGradient id="obs-track" x1="160" y1="20" x2="160" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F97316" stopOpacity="0.8" />
                <stop offset="1" stopColor="#8B5CF6" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="obs-glow" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FF6B00" />
                <stop offset="1" stopColor="#00F0FF" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#obs-bg)" />
            {/* Perspective Track Grid */}
            <path d="M120 180L148 40H172L200 180Z" fill="url(#obs-track)" />
            <path d="M60 180L140 40M260 180L180 40M100 180L144 40M220 180L176 40" stroke="#F97316" strokeWidth="1" strokeOpacity="0.4" />
            <line x1="80" y1="150" x2="240" y2="150" stroke="#00F0FF" strokeWidth="1.5" strokeOpacity="0.6" />
            <line x1="110" y1="110" x2="210" y2="110" stroke="#00F0FF" strokeWidth="1.2" strokeOpacity="0.5" />
            <line x1="130" y1="70" x2="190" y2="70" stroke="#00F0FF" strokeWidth="1" strokeOpacity="0.4" />
            {/* Rotating Hammer Obstacle */}
            <g transform="translate(160, 95) rotate(-25)">
              <circle cx="0" cy="0" r="10" fill="#EF4444" stroke="#FFA3A3" strokeWidth="2" />
              <rect x="-60" y="-6" width="120" height="12" rx="6" fill="#DC2626" stroke="#F87171" strokeWidth="1.5" />
              <circle cx="-50" cy="0" r="14" fill="#B91C1C" stroke="#FCA5A5" strokeWidth="2" />
              <circle cx="50" cy="0" r="14" fill="#B91C1C" stroke="#FCA5A5" strokeWidth="2" />
            </g>
            {/* Player Spheres */}
            <circle cx="140" cy="145" r="11" fill="#F59E0B" stroke="#FFF" strokeWidth="2" />
            <circle cx="143" cy="142" r="3" fill="#FFF" />
            <circle cx="178" cy="130" r="10" fill="#F43F5E" stroke="#FFF" strokeWidth="2" />
            {/* Finish Arch Glow in distance */}
            <path d="M140 40C140 25 180 25 180 40" stroke="#00F0FF" strokeWidth="3" strokeLinecap="round" />
            <circle cx="160" cy="30" r="12" fill="#00F0FF" fillOpacity="0.2" filter="blur(4px)" />
            {/* Floating Energy Sparks */}
            <circle cx="70" cy="60" r="2" fill="#F97316" />
            <circle cx="250" cy="50" r="2.5" fill="#8B5CF6" />
            <circle cx="240" cy="110" r="1.5" fill="#00F0FF" />
          </svg>
        );

      // 2. Connect Four (Gravity Drop Matrix)
      case 'connectfour':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="c4-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0B1528" />
                <stop offset="1" stopColor="#070D18" />
              </linearGradient>
              <linearGradient id="c4-board" x1="0" y1="0" x2="0" y2="160" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1E3A8A" />
                <stop offset="1" stopColor="#172554" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#c4-bg)" />
            {/* Holographic Stand */}
            <rect x="40" y="25" width="240" height="135" rx="14" fill="url(#c4-board)" stroke="#38BDF8" strokeWidth="2" strokeOpacity="0.6" />
            {/* Disc Slots */}
            {[0, 1, 2, 3, 4, 5, 6].map((col) =>
              [0, 1, 2, 3].map((row) => {
                const cx = 65 + col * 31;
                const cy = 46 + row * 27;
                // Sample winning sequence on col 2,3,4,5
                const isWinningCyan = (col === 2 && row === 3) || (col === 3 && row === 2) || (col === 4 && row === 1) || (col === 5 && row === 0);
                const isAmber = (col === 1 && row === 3) || (col === 2 && row === 2) || (col === 3 && row === 3) || (col === 4 && row === 3);

                return (
                  <g key={`${col}-${row}`}>
                    <circle cx={cx} cy={cy} r="10.5" fill="#0B132B" stroke="#1E293B" strokeWidth="1.5" />
                    {isWinningCyan ? (
                      <>
                        <circle cx={cx} cy={cy} r="8.5" fill="#06B6D4" stroke="#FFF" strokeWidth="1.5" />
                        <circle cx={cx} cy={cy} r="12" stroke="#00F0FF" strokeWidth="1.5" strokeOpacity="0.7" />
                      </>
                    ) : isAmber ? (
                      <circle cx={cx} cy={cy} r="8.5" fill="#F43F5E" stroke="#FECDD3" strokeWidth="1.5" />
                    ) : null}
                  </g>
                );
              })
            )}
            {/* Dynamic Drop Arrow */}
            <path d="M127 10L127 20M123 16L127 20L131 16" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

      // 3. Reaction Rush (High voltage reflex speed)
      case 'reactionrush':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="rr-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#06221A" />
                <stop offset="1" stopColor="#04120E" />
              </linearGradient>
              <radialGradient id="rr-core" cx="160" cy="90" r="80" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10B981" stopOpacity="0.9" />
                <stop offset="0.4" stopColor="#059669" stopOpacity="0.5" />
                <stop offset="1" stopColor="#06221A" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="320" height="180" fill="url(#rr-bg)" />
            {/* Glowing Core */}
            <circle cx="160" cy="90" r="75" fill="url(#rr-core)" />
            <circle cx="160" cy="90" r="50" stroke="#34D399" strokeWidth="2" strokeDasharray="6 4" />
            <circle cx="160" cy="90" r="32" fill="#10B981" stroke="#ECFDF5" strokeWidth="2.5" />
            {/* Lightning Zap Icon in center */}
            <path d="M162 70L148 92H162L158 110L174 88H160L162 70Z" fill="#FFFFFF" />
            {/* Millisecond Speed Indicator */}
            <text x="160" y="152" textAnchor="middle" fill="#A7F3D0" fontSize="13" fontWeight="bold" fontFamily="monospace">
              ⚡ 172 MS CLASH
            </text>
            {/* Speed Sparks */}
            <path d="M70 40L95 65M250 40L225 65M70 140L100 120M250 140L220 120" stroke="#10B981" strokeWidth="1.5" strokeOpacity="0.5" />
          </svg>
        );

      // 4. Pong Battle (Cyberpunk Vector Paddle)
      case 'pong':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pong-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#170F28" />
                <stop offset="1" stopColor="#0B0616" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#pong-bg)" />
            {/* Center Net */}
            <line x1="40" y1="90" x2="280" y2="90" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="8 6" strokeOpacity="0.5" />
            <circle cx="160" cy="90" r="28" stroke="#8B5CF6" strokeWidth="1.5" strokeOpacity="0.3" />
            {/* Top Paddle (Rose) */}
            <rect x="70" y="24" width="70" height="10" rx="5" fill="#F43F5E" stroke="#FECDD3" strokeWidth="1.5" />
            {/* Bottom Paddle (Cyan) */}
            <rect x="180" y="146" width="70" height="10" rx="5" fill="#06B6D4" stroke="#CFFAFE" strokeWidth="1.5" />
            {/* High-speed Ball with Trail */}
            <path d="M120 40L150 80L195 140" stroke="#A855F7" strokeWidth="2" strokeOpacity="0.4" strokeDasharray="4 4" />
            <circle cx="150" cy="80" r="7" fill="#FFFFFF" stroke="#00F0FF" strokeWidth="2" />
            <circle cx="150" cy="80" r="14" fill="#00F0FF" fillOpacity="0.25" />
          </svg>
        );

      // 5. Tic-Tac-Toe Duel (Holographic grid)
      case 'tictactoe':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ttt-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1F102B" />
                <stop offset="1" stopColor="#0E0716" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#ttt-bg)" />
            {/* 3x3 Grid Lines */}
            <line x1="125" y1="30" x2="125" y2="150" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7" />
            <line x1="195" y1="30" x2="195" y2="150" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7" />
            <line x1="65" y1="70" x2="255" y2="70" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7" />
            <line x1="65" y1="110" x2="255" y2="110" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.7" />
            {/* Neon X */}
            <g transform="translate(95, 50)">
              <line x1="-12" y1="-12" x2="12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="-12" x2="-12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="translate(160, 90)">
              <line x1="-12" y1="-12" x2="12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="-12" x2="-12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="translate(225, 130)">
              <line x1="-12" y1="-12" x2="12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
              <line x1="12" y1="-12" x2="-12" y2="12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
            </g>
            {/* Winning Diagonal Strike */}
            <line x1="75" y1="35" x2="245" y2="145" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.9" />
            {/* Neon O */}
            <circle cx="160" cy="50" r="14" stroke="#06B6D4" strokeWidth="4" fill="none" />
            <circle cx="95" cy="130" r="14" stroke="#06B6D4" strokeWidth="4" fill="none" />
          </svg>
        );

      // 6. Rock Paper Scissors (Cyber weapon showdown)
      case 'rps':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="rps-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#251210" />
                <stop offset="1" stopColor="#0E0606" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#rps-bg)" />
            {/* Clashing Energy Rings */}
            <circle cx="110" cy="90" r="44" stroke="#F59E0B" strokeWidth="2" strokeOpacity="0.4" />
            <circle cx="210" cy="90" r="44" stroke="#EC4899" strokeWidth="2" strokeOpacity="0.4" />
            {/* Left Weapon: Rock Crystal */}
            <polygon points="100,55 125,70 120,115 85,110 80,75" fill="#F59E0B" stroke="#FFF" strokeWidth="2" />
            {/* Right Weapon: Laser Plasma Shears */}
            <path d="M195 65L235 115M235 65L195 115" stroke="#EC4899" strokeWidth="4" strokeLinecap="round" />
            {/* Central Clash Spark */}
            <circle cx="160" cy="90" r="8" fill="#FFF" />
            <path d="M160 70V110M140 90H180" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      // 7. Memory Match (Synaptic Matrix)
      case 'memorymatch':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mm-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1B0E2B" />
                <stop offset="1" stopColor="#0B0514" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#mm-bg)" />
            {/* 4 Cards Showcase */}
            <rect x="55" y="45" width="46" height="62" rx="8" fill="#2E1065" stroke="#A855F7" strokeWidth="2" />
            <text x="78" y="82" textAnchor="middle" fill="#FFF" fontSize="20">🚀</text>

            <rect x="110" y="45" width="46" height="62" rx="8" fill="#581C87" stroke="#C084FC" strokeWidth="2.5" />
            <text x="133" y="82" textAnchor="middle" fill="#FFF" fontSize="20">💎</text>

            <rect x="165" y="45" width="46" height="62" rx="8" fill="#581C87" stroke="#C084FC" strokeWidth="2.5" />
            <text x="188" y="82" textAnchor="middle" fill="#FFF" fontSize="20">💎</text>

            <rect x="220" y="45" width="46" height="62" rx="8" fill="#2E1065" stroke="#A855F7" strokeWidth="2" />
            <text x="243" y="82" textAnchor="middle" fill="#FFF" fontSize="20">⚡</text>

            {/* Match Connected Beam */}
            <path d="M133 115C133 130 188 130 188 115" stroke="#10B981" strokeWidth="3" strokeLinecap="round" fill="none" />
            <text x="160" y="148" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="bold" fontFamily="sans-serif">MATCH FOUND!</text>
          </svg>
        );

      // 8. Number Blitz (Fast quantum arithmetic)
      case 'numberblitz':
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="nb-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0B1A30" />
                <stop offset="1" stopColor="#060E1A" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#nb-bg)" />
            {/* Digital Equation Banner */}
            <rect x="60" y="35" width="200" height="50" rx="12" fill="#1E293B" stroke="#38BDF8" strokeWidth="2" />
            <text x="160" y="68" textAnchor="middle" fill="#38BDF8" fontSize="22" fontWeight="900" fontFamily="monospace">
              24 × 3 = ?
            </text>
            {/* 4 Multiplier Tiles */}
            <rect x="60" y="95" width="45" height="32" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
            <text x="82" y="116" textAnchor="middle" fill="#94A3B8" fontSize="13" fontWeight="bold">68</text>

            <rect x="112" y="95" width="45" height="32" rx="6" fill="#047857" stroke="#34D399" strokeWidth="2" />
            <text x="134" y="116" textAnchor="middle" fill="#FFF" fontSize="14" fontWeight="bold">72</text>

            <rect x="164" y="95" width="45" height="32" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
            <text x="186" y="116" textAnchor="middle" fill="#94A3B8" fontSize="13" fontWeight="bold">76</text>

            <rect x="215" y="95" width="45" height="32" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
            <text x="237" y="116" textAnchor="middle" fill="#94A3B8" fontSize="13" fontWeight="bold">82</text>

            {/* Streak bar */}
            <text x="160" y="152" textAnchor="middle" fill="#F59E0B" fontSize="11" fontWeight="bold" fontFamily="monospace">
              🔥 5X COMBO STREAK
            </text>
          </svg>
        );

      // 9. Tap Frenzy (Dynamic target pop arena)
      case 'tapfrenzy':
      default:
        return (
          <svg viewBox="0 0 320 180" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="tf-bg" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
                <stop stopColor="#251C0A" />
                <stop offset="1" stopColor="#0F0B04" />
              </linearGradient>
            </defs>
            <rect width="320" height="180" fill="url(#tf-bg)" />
            {/* Target Crosshair Rings */}
            <circle cx="160" cy="90" r="60" stroke="#EAB308" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 4" />
            <circle cx="160" cy="90" r="35" stroke="#EAB308" strokeWidth="1.5" strokeOpacity="0.5" />
            {/* Gold Coin Target */}
            <g transform="translate(160, 90)">
              <circle cx="0" cy="0" r="22" fill="#EAB308" stroke="#FEF08A" strokeWidth="2.5" />
              <text x="0" y="7" textAnchor="middle" fill="#78350F" fontSize="16" fontWeight="900" fontFamily="monospace">+10</text>
            </g>
            {/* Diamond Spark Target */}
            <g transform="translate(80, 60)">
              <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#06B6D4" stroke="#A5F3FC" strokeWidth="2" transform="rotate(45)" />
              <text x="0" y="5" textAnchor="middle" fill="#FFF" fontSize="10" fontWeight="bold">+30</text>
            </g>
            {/* Skull Bomb Trap */}
            <g transform="translate(240, 115)">
              <circle cx="0" cy="0" r="16" fill="#E11D48" stroke="#FECDD3" strokeWidth="2" />
              <text x="0" y="5" textAnchor="middle" fill="#FFF" fontSize="13">💣</text>
            </g>
          </svg>
        );
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-white/10 shadow-inner group-hover:scale-[1.02] transition-transform duration-300 ${
        size === 'hero' ? 'aspect-[16/9] sm:aspect-[21/9]' : size === 'lg' ? 'aspect-[16/9]' : 'aspect-[16/9]'
      } ${className}`}
    >
      {getIllustration()}
      {/* Glossy overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-white/5 pointer-events-none" />
    </div>
  );
};
