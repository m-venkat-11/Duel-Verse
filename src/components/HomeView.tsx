import React, { useState } from 'react';
import { Swords, Plus, ArrowRight, Play, Users, Trophy, Sparkles, Shield, Zap, Hash, Brain, Activity, Flag, Crosshair, HelpCircle, Columns3, Grid } from 'lucide-react';
import { GAMES_CATALOG } from '../config/games';
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
  const [selectedGameId, setSelectedGameId] = useState<string>('tictactoe');
  const [maxRounds, setMaxRounds] = useState<number>(3);
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = () => {
    soundService.playClick();
    onCreateRoom(selectedGameId, maxRounds);
  };

  const handleJoin = (e: React.FormEvent) => {
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
      const match = text.match(/(DV-[A-Z0-9]{4}|[A-Z0-9]{6}|[A-Z0-9]{4})/i);
      if (match) {
        setRoomCodeInput(match[0].toUpperCase());
      } else {
        setRoomCodeInput(text.trim().toUpperCase());
      }
    } catch {
      // Clipboard read permission fallback
    }
  };

  const getGameIcon = (id: string) => {
    switch (id) {
      case 'tictactoe': return '❌';
      case 'rps': return '✊';
      case 'connectfour': return '🔴';
      case 'reactionrush': return '⚡';
      case 'pong': return '🏓';
      case 'obstaclerush': return '🏃';
      case 'memorymatch': return '🧠';
      case 'numberblitz': return '🔢';
      case 'tapfrenzy': return '🎯';
      default: return '🎮';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 flex flex-col items-center">
      {/* Hero Title */}
      <div className="text-center mb-8 relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Zero-Install Instant Mobile Multiplayer</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black font-['Outfit'] tracking-tight text-white mb-2">
          DUEL<span className="text-[var(--brand-cyan)]">VERSE</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto font-medium">
          Open URL on two mobile phones, join room via 6-character code or QR, and compete in real-time arcade classics!
        </p>
      </div>

      {/* Player Profile Quick Card */}
      <div
        onClick={onOpenProfile}
        className="glass-card w-full max-w-lg p-3.5 mb-8 border border-violet-500/30 flex items-center justify-between gap-4 cursor-pointer hover:border-violet-400 transition shadow-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-600/30 border border-violet-400/50 flex items-center justify-center text-3xl shadow-md">
            {profile.avatarId}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white font-['Outfit'] text-base">
                {profile.nickname}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                EDIT
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="text-amber-400 font-semibold">{profile.stats.wins} Wins</span>
              <span>•</span>
              <span className="text-rose-400">{profile.stats.losses} Losses</span>
            </div>
          </div>
        </div>

        <button className="btn-secondary py-1.5 px-3 text-xs">
          Edit Persona
        </button>
      </div>

      {/* Main Dual Panels: Create Room & Join Room */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl mb-12">
        {/* Panel 1: Create Room */}
        <div className="glass-panel p-6 border border-violet-500/40 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center gap-2 mb-2 text-violet-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Plus className="w-4 h-4" />
              <span>Host a Match</span>
            </div>
            <h2 className="text-2xl font-black font-['Outfit'] text-white mb-2">
              Create New Room
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Launch a private game lobby and invite a friend with a room code or QR code.
            </p>

            {/* Pick Initial Game */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Initial Game
              </label>
              <select
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-['Outfit'] font-semibold focus:outline-none focus:border-violet-500 transition text-sm cursor-pointer"
              >
                {GAMES_CATALOG.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                    {g.title} ({g.playersRange})
                  </option>
                ))}
              </select>
            </div>

            {/* Rounds Selector */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Match Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMaxRounds(3)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold font-['Outfit'] border transition ${
                    maxRounds === 3
                      ? 'bg-violet-600/40 border-violet-400 text-white shadow-md'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Best of 3 Rounds
                </button>
                <button
                  type="button"
                  onClick={() => setMaxRounds(5)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold font-['Outfit'] border transition ${
                    maxRounds === 5
                      ? 'bg-violet-600/40 border-violet-400 text-white shadow-md'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Best of 5 Rounds
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleCreate}
            className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Create & Enter Room</span>
          </button>
        </div>

        {/* Panel 2: Join Room */}
        <div className="glass-panel p-6 border border-cyan-500/30 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center gap-2 mb-2 text-cyan-400 font-bold text-xs uppercase tracking-wider font-mono">
              <Users className="w-4 h-4" />
              <span>Challenger</span>
            </div>
            <h2 className="text-2xl font-black font-['Outfit'] text-white mb-2">
              Join with Code
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Enter your opponent's 6-character room code to connect instantly.
            </p>

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Room Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. DV-8492"
                    value={roomCodeInput}
                    onChange={(e) => {
                      setRoomCodeInput(e.target.value.toUpperCase());
                      setErrorMsg(null);
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-white font-mono font-bold text-lg tracking-wider placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 transition"
                  />
                  <button
                    type="button"
                    onClick={handlePasteCode}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
                  >
                    Paste
                  </button>
                </div>
                {errorMsg && (
                  <p className="text-xs text-rose-400 mt-1.5 font-medium">{errorMsg}</p>
                )}
              </div>
            </form>
          </div>

          <div className="pt-6">
            <button
              onClick={handleJoin}
              disabled={!roomCodeInput.trim()}
              className="btn-primary btn-cyan w-full py-3.5 text-base flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-5 h-5" />
              <span>Join Battle Room</span>
            </button>
          </div>
        </div>
      </div>

      {/* Featured Game Showcase Section */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold font-['Outfit'] text-white">
              Instant Arcade Library
            </h3>
            <p className="text-xs text-slate-400">9 real-time multiplayer titles ready to play</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
            All 100% Free & Fast
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {GAMES_CATALOG.map((game) => (
            <div
              key={game.id}
              onClick={() => {
                soundService.playClick();
                setSelectedGameId(game.id);
                onCreateRoom(game.id, 3);
              }}
              className="glass-card p-4 border border-slate-800 hover:border-violet-500/60 cursor-pointer flex flex-col justify-between group shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
                    style={{
                      backgroundColor: `${game.accentColor}20`,
                      borderColor: `${game.accentColor}60`,
                      color: game.accentColor
                    }}
                  >
                    {getGameIcon(game.id)}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-800 text-slate-400 group-hover:bg-violet-500/20 group-hover:text-violet-300 transition">
                    {game.category}
                  </span>
                </div>

                <h4 className="font-bold text-white font-['Outfit'] text-base group-hover:text-violet-300 transition">
                  {game.title}
                </h4>
                <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                  {game.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                <span>~{game.estDurationSec}s per match</span>
                <span className="text-violet-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Play Now →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
