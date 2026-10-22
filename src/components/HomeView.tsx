import React, { useState } from 'react';
import { Swords, Plus, ArrowRight, Play, Users, Trophy, Sparkles, Shield, Zap, Hash, Brain, Activity, Flag, Crosshair, ChevronRight, Share2, Smartphone, HelpCircle } from 'lucide-react';
import { GAMES_CATALOG, type GameCategory } from '../config/games';
import { GameCard } from './GameCard';
import { GameArtwork } from './artwork/GameArtwork';
import { soundService } from '../services/sound';
import type { LocalPlayerProfile } from '../services/player';

interface HomeViewProps {
  profile: LocalPlayerProfile;
  onCreateRoom: (gameId: string, maxRounds: number) => void;
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

  const flagshipGame = GAMES_CATALOG.find((g) => g.id === 'obstaclerush') || GAMES_CATALOG[0];

  const handleCreateDefault = (gameId: string = 'obstaclerush') => {
    soundService.playClick();
    onCreateRoom(gameId, 3);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter a valid room code');
      return;
    }
    soundService.playClick();
    onJoinRoom(cleanCode);
  };

  const handlePasteCode = async () => {
    try {
      soundService.playClick();
      const text = await navigator.clipboard.readText();
      const match = text.match(/(DV-[A-Z0-9]{4}|[A-Z0-9]{6}|[A-Z0-9]{4})/i);
      if (match) {
        setRoomCodeInput(match[0].toUpperCase());
      } else {
        setRoomCodeInput(text.trim().toUpperCase());
      }
    } catch {
      // Clipboard fallback
    }
  };

  const categories: { id: GameCategory; label: string }[] = [
    { id: 'all', label: 'All Games (9)' },
    { id: 'physics', label: 'Physics & Action' },
    { id: 'foundational', label: 'Classics' },
    { id: 'reflex', label: 'Reflex Speed' },
    { id: 'brain', label: 'Brain & Tactics' }
  ];

  const totalMatches = profile.stats.wins + profile.stats.losses + profile.stats.draws;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col items-center">
      {/* Top Hero Section */}
      <div className="w-full relative mb-10 text-center sm:text-left">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-96 h-64 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-10 w-80 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-7 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold mb-4 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zero-Install Instant Multiplayer Arcade</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black font-['Outfit'] tracking-tight text-white leading-tight mb-3">
              YOUR FRIENDS. <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-cyan-300 to-white">
                YOUR ARENA.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl font-medium leading-relaxed mb-6">
              9 instant games. One room. Endless rivalries. Open on two phones, connect via 6-character code or QR, and duel in real time with authoritative synchronization.
            </p>

            {/* Main Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                id="btn-create-room"
                onClick={() => handleCreateDefault('obstaclerush')}
                className="btn-primary w-full sm:w-auto px-7 py-4 text-base flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
              >
                <Plus className="w-5 h-5" />
                <span>Create Battle Room</span>
              </button>

              <button
                id="btn-toggle-join"
                onClick={() => setIsJoinExpanded(!isJoinExpanded)}
                className="btn-secondary w-full sm:w-auto px-6 py-4 text-base flex items-center justify-center gap-2 border-cyan-500/30 hover:border-cyan-400 text-cyan-300 bg-cyan-950/20 hover:bg-cyan-900/30"
              >
                <Users className="w-5 h-5 text-cyan-400" />
                <span>Join with Code</span>
              </button>
            </div>

            {/* Quick Code Input Drawer (When toggled) */}
            {isJoinExpanded && (
              <form onSubmit={handleJoinSubmit} className="mt-4 p-4 rounded-2xl glass-panel border border-cyan-500/40 w-full max-w-md animate-fade-in shadow-2xl">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Enter 6-Character Room Code</span>
                  <button
                    type="button"
                    onClick={handlePasteCode}
                    className="text-cyan-400 hover:text-white text-[11px] font-semibold"
                  >
                    Paste from Clipboard
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
                    className="btn-primary btn-cyan px-5 py-2.5 text-sm font-bold flex items-center gap-1.5"
                  >
                    <span>Join</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                {errorMsg && (
                  <p className="text-xs text-rose-400 mt-2 font-medium">{errorMsg}</p>
                )}
              </form>
            )}
          </div>

          {/* Right Column: Featured Obstacle Rush Card */}
          <div className="lg:col-span-5 w-full">
            <div
              onClick={() => handleCreateDefault('obstaclerush')}
              className="glass-panel p-5 border border-orange-500/40 rounded-3xl relative overflow-hidden group cursor-pointer shadow-2xl hover:border-orange-400 transition-all duration-300"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 font-mono">
                  ★ FLAGSHIP TITLE
                </span>
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <span>Live 2.5D Physics</span>
                </span>
              </div>

              {/* Artwork */}
              <GameArtwork gameId="obstaclerush" size="lg" className="mb-4" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black font-['Outfit'] text-white group-hover:text-orange-400 transition-colors">
                    Obstacle Rush
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Stumble Guys-style gauntlet race with moving rotators & checkpoints
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/40 group-hover:scale-110 transition-transform shrink-0">
                  <Play className="w-5 h-5 fill-current" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile & Recent Record Bar (When matches played) */}
      {totalMatches > 0 && (
        <div
          onClick={onOpenProfile}
          className="w-full glass-card p-4 rounded-2xl border border-violet-500/30 mb-8 flex items-center justify-between gap-4 cursor-pointer hover:border-violet-400 transition shadow-lg"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-violet-600/30 border border-violet-400/50 flex items-center justify-center text-3xl shadow-md shrink-0">
              {profile.avatarId}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white font-['Outfit'] text-base">
                  {profile.nickname}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {totalMatches} Matches Played
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs mt-1">
                <span className="text-amber-400 font-bold font-mono">{profile.stats.wins}W</span>
                <span className="text-rose-400 font-bold font-mono">{profile.stats.losses}L</span>
                <span className="text-cyan-400 font-bold font-mono">{profile.stats.draws}D</span>
              </div>
            </div>
          </div>

          <button className="btn-secondary py-1.5 px-3 text-xs">
            Edit Profile
          </button>
        </div>
      )}

      {/* Arcade Games Library Section */}
      <div className="w-full mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black font-['Outfit'] text-white tracking-tight">
              Arcade Library
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any game to host a match with instant room code & QR invite
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-white/5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  soundService.playClick();
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-['Outfit'] transition ${
                  selectedCategory === cat.id
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reusable Game Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onSelect={(gameId) => handleCreateDefault(gameId)}
            />
          ))}
        </div>
      </div>

      {/* How To Play 3-Step Guide */}
      <div className="w-full glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 mb-12 shadow-2xl">
        <div className="text-center max-w-md mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-bold font-mono mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>INSTANT PLAY PROTOCOL</span>
          </div>
          <h3 className="text-2xl font-black font-['Outfit'] text-white">
            How It Works in 3 Steps
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Zero app downloads. Zero sign-up passwords. Pure instant multiplayer fun.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-400/40 text-violet-300 font-black text-xl flex items-center justify-center mb-3 font-mono">
              1
            </div>
            <h4 className="font-bold text-white font-['Outfit'] text-base mb-1">
              Create a Room
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Click 'Create Room' to generate a 6-character room code (e.g. <span className="font-mono text-violet-300">DV-8492</span>).
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-black text-xl flex items-center justify-center mb-3 font-mono">
              2
            </div>
            <h4 className="font-bold text-white font-['Outfit'] text-base mb-1">
              Invite Your Friend
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Show your phone's screen for them to scan the QR code or send them the invite link.
            </p>
          </div>

          <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-xl flex items-center justify-center mb-3 font-mono">
              3
            </div>
            <h4 className="font-bold text-white font-['Outfit'] text-base mb-1">
              Duel in Real Time
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ready up and duel with live scoreboards, instant rematch voting, and game switching!
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 pt-8 pb-4 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 font-bold font-['Outfit'] text-slate-400">
          <Swords className="w-4 h-4 text-violet-400" />
          <span>DUELVERSE • Mobile-First Real-Time Web Arcade</span>
        </div>
        <p className="text-[11px] text-slate-600 max-w-sm">
          Authoritative real-time state synchronization, procedural Web Audio API synthesis, and zero-install gaming.
        </p>
      </footer>
    </div>
  );
};
