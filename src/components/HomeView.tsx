import React, { useState } from 'react';
import { Plus, ArrowRight, Users, Flame, Gamepad2, HelpCircle, Swords, Zap, Sparkles } from 'lucide-react';
import { GAMES_CATALOG, type GameCategory } from '../config/games';
import { GameCard } from './GameCard';
import { soundService } from '../services/sound';
import { getPlayerRank, type LocalPlayerProfile } from '../services/player';

interface HomeViewProps {
  profile: LocalPlayerProfile;
  onCreateRoom: (gameId: string, maxRounds: number, withBot?: boolean) => void;
  onJoinRoom: (roomId: string) => void;
  onOpenProfile: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  onCreateRoom,
  onJoinRoom,
  onOpenProfile
}) => {
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>('all');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [isJoinExpanded, setIsJoinExpanded] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredGames = GAMES_CATALOG.filter((g) => {
    if (selectedCategory === 'all') return true;
    return g.category === selectedCategory;
  });

  const handleCreateDefault = (gameId: string = 'tankduel') => {
    soundService.playClick();
    onCreateRoom(gameId, 3, false);
  };

  const handlePlayVsBot = (gameId: string = 'tankduel') => {
    soundService.playClick();
    onCreateRoom(gameId, 3, true);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter a valid 6-character room code');
      return;
    }
    soundService.playClick();
    onJoinRoom(cleanCode);
  };

  const handlePasteCode = async () => {
    try {
      soundService.playClick();
      const text = await navigator.clipboard.readText();
      const match = text.match(/(DV-[A-Z0-9]{4,6}|[A-Z0-9]{4,6})/i);
      if (match) {
        setRoomCodeInput(match[0].toUpperCase());
      } else {
        setRoomCodeInput(text.trim().toUpperCase());
      }
    } catch {
      // Fallback
    }
  };

  const categories: { id: GameCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'All Titles (10)', icon: '🎮' },
    { id: 'physics', label: 'Physics & Action', icon: '🏃' },
    { id: 'foundational', label: 'Classics', icon: '⚔️' },
    { id: 'reflex', label: 'Reflex Speed', icon: '⚡' },
    { id: 'brain', label: 'Tactics & Brain', icon: '🧠' }
  ];

  const totalMatches = profile.stats.wins + profile.stats.losses + profile.stats.draws;
  const rank = getPlayerRank(profile.stats.wins);
  const winRate = totalMatches > 0 ? Math.round((profile.stats.wins / totalMatches) * 100) : 0;

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-2 flex flex-col items-center">
      {/* Cinematic Hero Stage */}
      <div className="w-full rounded-3xl overflow-hidden relative mb-6 border border-white/15 shadow-2xl bg-slate-950">
        {/* Background Key Art Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/assets/hero_banner.jpg"
            alt="DuelVerse Arena"
            className="w-full h-full object-cover object-center opacity-40 scale-105 filter blur-[0.5px]"
          />
          {/* Deep cyber gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070a13] via-[#070a13]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070a13] via-[#070a13]/60 to-transparent" />
        </div>

        {/* Content over Banner */}
        <div className="relative z-10 p-6 sm:p-10 lg:p-12 flex flex-col items-start max-w-2xl">
          {/* Live Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black font-mono tracking-wider mb-3 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>INSTANT MULTIPLAYER ARCADE • 10 GAMES LIVE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-['Outfit'] tracking-tight text-white leading-none mb-3 drop-shadow-lg">
            YOUR FRIENDS.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-300 to-amber-300">
              YOUR ARENA.
            </span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed mb-6 max-w-lg drop-shadow">
            Zero installs. Zero waiting. Scan a QR code or share a 6-character room code to duel your friends or challenge CyberBot in real time.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              id="btn-quick-bot"
              onClick={() => handlePlayVsBot('tankduel')}
              className="btn-arcade btn-arcade-cyan px-6 py-3.5 text-base font-black flex items-center justify-center gap-2 shadow-xl shadow-cyan-600/30 active:scale-95 transition"
            >
              <span>🤖 INSTANT VS CYBERBOT</span>
            </button>

            <button
              id="btn-create-room"
              onClick={() => handleCreateDefault('tankduel')}
              className="btn-arcade btn-arcade-rose px-6 py-3.5 text-base font-black flex items-center justify-center gap-2 shadow-xl shadow-rose-600/30 active:scale-95 transition"
            >
              <Plus className="w-5 h-5 stroke-[3]" />
              <span>HOST 2P ROOM</span>
            </button>

            <button
              id="btn-toggle-join"
              onClick={() => setIsJoinExpanded(!isJoinExpanded)}
              className="px-5 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Users className="w-4 h-4 text-slate-300" />
              <span>JOIN CODE</span>
            </button>
          </div>

          {/* Quick Join Drawer */}
          {isJoinExpanded && (
            <form onSubmit={handleJoinSubmit} className="mt-4 p-4 rounded-2xl glass-panel border border-cyan-500/50 w-full max-w-md animate-slide-up shadow-2xl">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between font-mono">
                <span>Enter 6-Character Room Code</span>
                <button
                  type="button"
                  onClick={handlePasteCode}
                  className="text-cyan-400 hover:text-white text-[11px] font-semibold underline"
                >
                  Paste
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  placeholder="e.g. DV-8492"
                  value={roomCodeInput}
                  onChange={(e) => {
                    setRoomCodeInput(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono font-bold text-base uppercase tracking-wider focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="btn-arcade btn-arcade-cyan px-5 py-2.5 text-sm font-black flex items-center gap-1.5 shrink-0"
                >
                  <span>Join</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
              {errorMsg && (
                <p className="text-xs text-rose-400 mt-2 font-medium">{errorMsg}</p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Duelist Gamer Passport Banner */}
      <div
        onClick={onOpenProfile}
        className="w-full glass-card p-4 sm:p-5 rounded-3xl border-2 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-violet-400 transition-all duration-200 shadow-xl relative overflow-hidden group"
        style={{
          borderColor: profile.accentColor || '#8B5CF6',
          boxShadow: `0 0 30px ${(profile.accentColor || '#8B5CF6')}25`
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shadow-xl shrink-0 border-2 transition-transform duration-200 group-hover:scale-105"
            style={{
              backgroundColor: `${profile.accentColor || '#8B5CF6'}20`,
              borderColor: profile.accentColor || '#8B5CF6'
            }}
          >
            {profile.avatarId}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-white font-['Outfit'] text-lg sm:text-xl truncate">
                {profile.nickname}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-mono font-black flex items-center gap-1 border border-white/20 shrink-0"
                style={{ backgroundColor: rank.color, color: '#000' }}
              >
                <span>{rank.badge}</span>
                <span className="uppercase">{rank.tier}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 font-mono font-bold">
              <span className="text-amber-400">{profile.stats.wins} Wins</span>
              <span className="text-rose-400">{profile.stats.losses} Losses</span>
              <span className="text-cyan-400">{profile.stats.draws} Draws</span>
              <span className="text-emerald-400 font-extrabold">{winRate}% WR</span>
              {Boolean(profile.stats.currentStreak) && (
                <span className="text-orange-400 font-extrabold">
                  🔥 {profile.stats.currentStreak} Streak
                </span>
              )}
            </div>

            {profile.motto && (
              <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-1">
                "{profile.motto}"
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button className="btn-secondary py-2 px-4 text-xs font-bold font-mono flex items-center gap-1.5 shadow-sm">
            <span>Customize</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      </div>

      {/* Arcade Library Header & Filter Pills */}
      <div className="w-full mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black font-['Outfit'] text-white tracking-tight flex items-center gap-2">
              <Gamepad2 className="w-6 h-6 text-violet-400" />
              <span>ARCADE GAME LIBRARY</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Pick any title below to launch an instant room
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-white/10">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  soundService.playClick();
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black font-['Outfit'] transition flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 10 Game Capsules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onSelect={(gameId) => handleCreateDefault(gameId)}
              onPlayVsAi={(gameId) => handlePlayVsBot(gameId)}
            />
          ))}
        </div>
      </div>

      {/* 3-Step Protocol Guide */}
      <div className="w-full glass-panel p-5 sm:p-7 rounded-3xl border border-white/10 my-4 shadow-2xl relative overflow-hidden">
        <div className="text-center max-w-md mx-auto mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-bold font-mono mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>HOW TO PLAY IN 3 SECONDS</span>
          </div>
          <h3 className="text-2xl font-black font-['Outfit'] text-white">
            Zero Downloads. Pure Rivalry.
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Works instantly across any mobile browser, tablet, or desktop.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="w-11 h-11 rounded-xl bg-violet-500/20 border border-violet-400/40 text-violet-300 font-black text-lg flex items-center justify-center mb-2.5 font-mono">
              1
            </div>
            <h4 className="font-extrabold text-white font-['Outfit'] text-base mb-1">
              Create a Room
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pick a game and generate an instant 6-character room code.
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-black text-lg flex items-center justify-center mb-2.5 font-mono">
              2
            </div>
            <h4 className="font-extrabold text-white font-['Outfit'] text-base mb-1">
              Invite Your Rival
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Show QR code to scan or share link via WhatsApp or iMessage.
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-lg flex items-center justify-center mb-2.5 font-mono">
              3
            </div>
            <h4 className="font-extrabold text-white font-['Outfit'] text-base mb-1">
              Duel in Real Time
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sub-5ms low latency with live scores and 1-tap rematches.
            </p>
          </div>
        </div>
      </div>

      {/* Cyber Gaming Footer */}
      <footer className="w-full border-t border-white/10 pt-5 pb-5 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 font-black font-['Outfit'] text-slate-400 text-sm">
          <Swords className="w-4 h-4 text-violet-400" />
          <span>DUELVERSE • ZERO-INSTALL MOBILE MULTIPLAYER ARCADE</span>
        </div>
        <p className="text-[11px] text-slate-600 max-w-sm">
          Powered by authoritative state synchronization and Web Audio API synthesis.
        </p>
      </footer>
    </div>
  );
};
