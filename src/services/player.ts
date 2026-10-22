export interface LocalPlayerProfile {
  uid: string;
  nickname: string;
  avatarId: string;
  accentColor: string;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
}

const AVATARS = ['⚡', '🎮', '🚀', '🦊', '🐉', '👑', '🎯', '👾', '🔥', '🤖', '🐱', '🦄'];
const ADJECTIVES = ['Neon', 'Cyber', 'Shadow', 'Turbo', 'Hyper', 'Swift', 'Apex', 'Laser', 'Pixel', 'Sonic'];
const NOUNS = ['Viper', 'Blade', 'Falcon', 'Nova', 'Pulse', 'Fox', 'Dragon', 'Rider', 'Specter', 'Titan'];

function generateRandomNickname(prefix?: string): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return prefix ? `${prefix}_${noun}` : `${adj}${noun}${num}`;
}

function generateUid(): string {
  return 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

const STORAGE_KEY = 'duelverse_player_profile';
const SESSION_KEY = 'duelverse_session_profile';

export function getOrCreatePlayerProfile(): LocalPlayerProfile {
  // Check if simulated player or guest mode in URL
  const isSimulated = typeof window !== 'undefined' && (
    window.location.search.includes('simulate=1') ||
    window.location.search.includes('guest=1')
  );

  // Per-tab session storage check
  try {
    const sessionStored = sessionStorage.getItem(SESSION_KEY);
    if (sessionStored) {
      const parsed = JSON.parse(sessionStored);
      if (parsed.uid && parsed.nickname) {
        return parsed;
      }
    }
  } catch {
    // Session storage fallback
  }

  // If this tab was opened as simulated Player 2, create distinct guest identity
  if (isSimulated) {
    const simulatedProfile: LocalPlayerProfile = {
      uid: generateUid(),
      nickname: generateRandomNickname('Challenger'),
      avatarId: '🦊',
      accentColor: '#F43F5E',
      stats: { wins: 0, losses: 0, draws: 0 }
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(simulatedProfile));
    } catch {}
    return simulatedProfile;
  }

  // Otherwise check permanent localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.uid && parsed.nickname) {
        // Cache to sessionStorage for this tab
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed)); } catch {}
        return parsed;
      }
    }
  } catch {
    // Local storage parse error fallback
  }

  const newProfile: LocalPlayerProfile = {
    uid: generateUid(),
    nickname: generateRandomNickname(),
    avatarId: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    accentColor: '#8B5CF6',
    stats: {
      wins: 0,
      losses: 0,
      draws: 0,
    },
  };

  savePlayerProfile(newProfile);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newProfile));
  } catch {}
  return newProfile;
}

export function savePlayerProfile(profile: LocalPlayerProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

export function updatePlayerStats(outcome: 'win' | 'loss' | 'draw') {
  const profile = getOrCreatePlayerProfile();
  if (outcome === 'win') profile.stats.wins += 1;
  else if (outcome === 'loss') profile.stats.losses += 1;
  else if (outcome === 'draw') profile.stats.draws += 1;
  savePlayerProfile(profile);
}

export const AVAILABLE_AVATARS = AVATARS;
