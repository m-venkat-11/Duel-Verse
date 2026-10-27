export type GameCategory = 'all' | 'foundational' | 'physics' | 'reflex' | 'brain';

export interface GameMetadata {
  id: string;
  title: string;
  tagline: string;
  category: 'foundational' | 'physics' | 'reflex' | 'brain';
  playersRange: string;
  estDurationSec: number;
  difficulty: 'Casual' | 'Tactical' | 'Reflex' | 'Intense';
  accentColor: string;
  accentGradient: string;
  description: string;
  featured?: boolean;
  playable: boolean;
}

export const GAMES_CATALOG: GameMetadata[] = [
  {
    id: 'obstaclerush',
    title: 'Obstacle Rush',
    tagline: 'High-speed 60 FPS dual-track gauntlet race',
    category: 'physics',
    playersRange: '1v1 • Live',
    estDurationSec: 60,
    difficulty: 'Intense',
    accentColor: '#F97316',
    accentGradient: 'from-amber-500 via-orange-600 to-rose-600',
    description: 'Sprint through 3 high-speed lanes, dodge laser barriers and EMP traps, and hit turbo pads to reach the 1000m finish arch first!',
    featured: true,
    playable: true
  },
  {
    id: 'connectfour',
    title: 'Connect Four',
    tagline: 'Gravity-based 4-in-a-row spatial duel',
    category: 'foundational',
    playersRange: '1v1 • Turn-based',
    estDurationSec: 120,
    difficulty: 'Tactical',
    accentColor: '#06B6D4',
    accentGradient: 'from-cyan-500 via-blue-600 to-indigo-600',
    description: 'Drop power discs into the 7-column gravity matrix. Create horizontal, vertical, or diagonal 4-disc alignments.',
    featured: true,
    playable: true
  },
  {
    id: 'reactionrush',
    title: 'Reaction Rush',
    tagline: 'Sub-millisecond reflex speed clash',
    category: 'reflex',
    playersRange: '1v1 • Realtime',
    estDurationSec: 45,
    difficulty: 'Reflex',
    accentColor: '#10B981',
    accentGradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    description: 'Wait for the electric green reactor signal. Tap instantly! False starts immediately forfeit the round.',
    featured: true,
    playable: true
  },
  {
    id: 'pong',
    title: 'Pong Battle',
    tagline: 'High-speed modernized 60 FPS paddle duel',
    category: 'physics',
    playersRange: '1v1 • Realtime',
    estDurationSec: 90,
    difficulty: 'Reflex',
    accentColor: '#8B5CF6',
    accentGradient: 'from-violet-500 via-purple-600 to-pink-600',
    description: 'Fast-paced cyber court battle. Consecutive returns accelerate ball velocity with sharp deflection angles.',
    featured: false,
    playable: true
  },
  {
    id: 'tictactoe',
    title: 'Tic-Tac-Toe Duel',
    tagline: 'Tactical holographic 3×3 arena',
    category: 'foundational',
    playersRange: '1v1 • Turn-based',
    estDurationSec: 45,
    difficulty: 'Casual',
    accentColor: '#EC4899',
    accentGradient: 'from-pink-500 via-rose-600 to-violet-600',
    description: 'Instant turn-based tactical clash. Control corners, bait lines, and trigger winning sequence highlights.',
    featured: false,
    playable: true
  },
  {
    id: 'rps',
    title: 'RPS: Best of Five',
    tagline: 'Simultaneous secret mind games',
    category: 'foundational',
    playersRange: '1v1 • Simultaneous',
    estDurationSec: 60,
    difficulty: 'Casual',
    accentColor: '#F59E0B',
    accentGradient: 'from-amber-400 via-orange-500 to-rose-500',
    description: 'Cryptographic two-phase commit lock! Secretly commit your weapon and reveal together on synchronized timers.',
    featured: false,
    playable: true
  },
  {
    id: 'memorymatch',
    title: 'Memory Match Duel',
    tagline: 'Simultaneous competitive pair rush',
    category: 'brain',
    playersRange: '1v1 • Realtime',
    estDurationSec: 75,
    difficulty: 'Tactical',
    accentColor: '#A855F7',
    accentGradient: 'from-purple-500 via-fuchsia-600 to-pink-600',
    description: 'Both players flip cards on a shared 4×4 cyber-grid in real time. Snatch pairs before your rival spots them.',
    featured: false,
    playable: true
  },
  {
    id: 'numberblitz',
    title: 'Number Blitz',
    tagline: 'Rapid mental arithmetic speed sprint',
    category: 'brain',
    playersRange: '1v1 • Realtime',
    estDurationSec: 60,
    difficulty: 'Tactical',
    accentColor: '#3B82F6',
    accentGradient: 'from-blue-500 via-cyan-600 to-teal-500',
    description: 'Race through instant arithmetic problems. Chain consecutive answers for massive streak combo multipliers.',
    featured: false,
    playable: true
  },
  {
    id: 'tapfrenzy',
    title: 'Tap War: Tug of War',
    tagline: 'High-voltage 1v1 button mashing duel',
    category: 'reflex',
    playersRange: '1v1 • Realtime',
    estDurationSec: 40,
    difficulty: 'Reflex',
    accentColor: '#EAB308',
    accentGradient: 'from-yellow-400 via-amber-500 to-orange-600',
    description: 'Smash your power core faster than your opponent! Overpower their beam in high-voltage tug of war with live CPS and Frenzy mode!',
    featured: false,
    playable: true
  },
  {
    id: 'tankduel',
    title: 'Tank Duel',
    tagline: 'Ricochet laser tank arena battle',
    category: 'physics',
    playersRange: '1v1 • Realtime',
    estDurationSec: 90,
    difficulty: 'Intense',
    accentColor: '#10B981',
    accentGradient: 'from-emerald-500 via-teal-600 to-cyan-600',
    description: 'Steer your armored tank, take cover behind barricades, and fire bouncing plasma shells to eliminate your rival!',
    featured: true,
    playable: true
  },
  {
    id: 'slapduel',
    title: 'Slap Duel',
    tagline: 'Red Hands reflex duel with fake-outs',
    category: 'reflex',
    playersRange: '1v1 • Realtime',
    estDurationSec: 60,
    difficulty: 'Reflex',
    accentColor: '#EF4444',
    accentGradient: 'from-rose-500 via-red-600 to-amber-600',
    description: 'The timeless Red Hands challenge! Slap before they dodge, or feint to bait them into retreating for bonus strikes.',
    featured: true,
    playable: true
  },
  {
    id: 'knifemaster',
    title: 'Knife Master',
    tagline: 'Spinning target blade throw showdown',
    category: 'physics',
    playersRange: '1v1 • Turn/Speed',
    estDurationSec: 60,
    difficulty: 'Tactical',
    accentColor: '#06B6D4',
    accentGradient: 'from-cyan-500 via-teal-600 to-emerald-600',
    description: 'Hurl plasma blades into a spinning cyber core without hitting existing daggers. Clear your quiver first to claim victory!',
    featured: true,
    playable: true
  },
  {
    id: 'sumospin',
    title: 'Sumo Spinners',
    tagline: 'Bumping beyblade arena ring-out clash',
    category: 'physics',
    playersRange: '1v1 • Realtime',
    estDurationSec: 60,
    difficulty: 'Intense',
    accentColor: '#F59E0B',
    accentGradient: 'from-amber-500 via-orange-600 to-red-600',
    description: 'Control a heavy armored spinning top in a zero-friction circular ring. Ram your rival to knock them over the electrified edge!',
    featured: true,
    playable: true
  }
];

export function getGameMetadata(gameId: string): GameMetadata {
  return GAMES_CATALOG.find((g) => g.id === gameId) || GAMES_CATALOG[0];
}
