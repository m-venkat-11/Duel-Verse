import React, { useState } from 'react';

interface GameArtworkProps {
  gameId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

const COVER_MAP: Record<string, { image: string; fallbackGradient: string; title: string }> = {
  obstaclerush: {
    image: '/assets/obstacle_rush_cover.jpg',
    fallbackGradient: 'from-orange-600 via-amber-500 to-rose-600',
    title: 'Obstacle Rush'
  },
  connectfour: {
    image: '/assets/connect_four_cover.jpg',
    fallbackGradient: 'from-blue-600 via-cyan-500 to-indigo-700',
    title: 'Connect Four'
  },
  reactionrush: {
    image: '/assets/reaction_rush_cover.jpg',
    fallbackGradient: 'from-emerald-600 via-teal-500 to-cyan-500',
    title: 'Reaction Rush'
  },
  pong: {
    image: '/assets/pong_battle_cover.jpg',
    fallbackGradient: 'from-purple-600 via-fuchsia-500 to-pink-600',
    title: 'Pong Battle'
  },
  tictactoe: {
    image: '/assets/tictactoe_cover.jpg',
    fallbackGradient: 'from-pink-600 via-rose-500 to-amber-500',
    title: 'Tic-Tac-Toe Duel'
  },
  rps: {
    image: '/assets/rps_cover.jpg',
    fallbackGradient: 'from-amber-600 via-orange-500 to-red-600',
    title: 'RPS Showdown'
  },
  memorymatch: {
    image: '/assets/memory_match_cover.jpg',
    fallbackGradient: 'from-violet-600 via-purple-500 to-cyan-600',
    title: 'Memory Match'
  },
  numberblitz: {
    image: '/assets/number_blitz_cover.jpg',
    fallbackGradient: 'from-cyan-600 via-blue-500 to-teal-600',
    title: 'Number Blitz'
  },
  tapfrenzy: {
    image: '/assets/tap_frenzy_cover.jpg',
    fallbackGradient: 'from-yellow-500 via-amber-600 to-rose-600',
    title: 'Tap Frenzy'
  }
};

export const GameArtwork: React.FC<GameArtworkProps> = ({
  gameId,
  className = '',
  size = 'md'
}) => {
  const [hasError, setHasError] = useState(false);
  const data = COVER_MAP[gameId] || COVER_MAP.obstaclerush;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-white/10 shadow-lg group-hover:scale-[1.03] transition-all duration-300 bg-slate-900 ${
        size === 'hero' ? 'aspect-[16/9]' : size === 'lg' ? 'aspect-[16/9]' : size === 'sm' ? 'aspect-[16/9]' : 'aspect-[16/9]'
      } ${className}`}
    >
      {!hasError ? (
        <img
          src={data.image}
          alt={data.title}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover object-center group-hover:brightness-110 transition-all duration-300 select-none"
          loading="lazy"
        />
      ) : (
        <div className={`w-full h-full bg-gradient-to-tr ${data.fallbackGradient} flex items-center justify-center p-4 text-center`}>
          <span className="font-['Outfit'] font-black text-white text-lg drop-shadow-md">
            {data.title}
          </span>
        </div>
      )}

      {/* Subtle glossy sheen */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 pointer-events-none" />

      {/* Corner Esports Indicator */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/20 text-[9px] font-black uppercase tracking-widest text-white font-mono shadow-sm">
        1v1 LIVE
      </div>
    </div>
  );
};
