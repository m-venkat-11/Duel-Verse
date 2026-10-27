import React, { useState, useEffect } from 'react';
import { Swords, Zap, Users, Bot, Sparkles, ChevronRight, Volume2, Shield } from 'lucide-react';
import { soundService } from '../services/sound';

interface IntroScreenProps {
  onEnter: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onEnter }) => {
  const [isEntering, setIsEntering] = useState(false);
  const [pulseGlow, setPulseGlow] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseGlow((prev) => !prev);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const handleStart = () => {
    if (isEntering) return;
    setIsEntering(true);
    soundService.playCountdown?.(0);
    soundService.playClick?.();
    setTimeout(() => {
      onEnter();
    }, 600);
  };

  return (
    <div
      onClick={handleStart}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 bg-[#05070e] select-none cursor-pointer transition-all duration-700 overflow-hidden ${
        isEntering ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Animated Cyber Matrix & Radial Glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.25),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_120%,rgba(6,182,212,0.22),rgba(255,255,255,0))]" />

        {/* Cyber Neon Floor Grid */}
        <div
          className="absolute bottom-0 inset-x-0 h-96 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(139, 92, 246, 0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(6, 182, 212, 0.2) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            transform: 'perspective(500px) rotateX(65deg)',
            transformOrigin: 'bottom center',
          }}
        />

        {/* Ambient Floating Particle Orbs */}
        <div className="absolute top-1/4 left-1/6 w-72 h-72 rounded-full bg-violet-600/15 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/6 w-80 h-80 rounded-full bg-cyan-500/15 blur-3xl animate-pulse delay-700" />
      </div>

      {/* Top Header Branding */}
      <div className="relative z-10 w-full max-w-4xl flex items-center justify-between pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-violet-500/40 text-violet-300 text-xs font-mono font-bold backdrop-blur-md shadow-lg shadow-violet-500/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>ARCADE ONLINE • BUILD 2.0</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleStart();
          }}
          className="px-4 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono font-bold transition backdrop-blur-md flex items-center gap-1.5"
        >
          <span>SKIP INTRO</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Center Stage: Animated Hologram Logo */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center px-4 max-w-3xl">
        {/* Animated Emblem */}
        <div className="relative mb-6 group">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-violet-600 to-cyan-500 opacity-60 blur-xl group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt" />

          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-2 border-violet-400/80 flex items-center justify-center shadow-2xl">
            <Swords className="w-12 h-12 sm:w-14 sm:h-14 text-cyan-300 filter drop-shadow-[0_0_15px_rgba(6,182,212,0.8)] animate-pulse" />
            <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950 text-[10px] font-black font-mono tracking-widest shadow-md">
              10 GAMES
            </div>
          </div>
        </div>

        {/* 3D Glowing Title */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-black font-['Outfit'] tracking-tight text-white uppercase leading-none drop-shadow-[0_0_35px_rgba(139,92,246,0.6)]">
          DUEL<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-300 to-amber-300">VERSE</span>
        </h1>

        <p className="mt-4 text-sm sm:text-lg text-slate-300 font-mono tracking-widest uppercase font-semibold">
          Instant Real-Time Multiplayer Arcade
        </p>

        {/* Feature Badges Pill Row */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            60 FPS Physics
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs font-semibold">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            Cross-Device QR Join
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs font-semibold">
            <Bot className="w-3.5 h-3.5 text-rose-400" />
            Master CyberBot AI
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs font-semibold">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Zero Installs
          </span>
        </div>

        {/* Arcade "PRESS START / TAP TO ENTER" Call to Action */}
        <div className="mt-10 sm:mt-12 flex flex-col items-center">
          <button
            onClick={handleStart}
            className={`group relative px-8 sm:px-12 py-4 sm:py-5 rounded-2xl font-black font-['Outfit'] text-lg sm:text-xl tracking-wider text-slate-950 uppercase transition-all duration-300 transform active:scale-95 shadow-2xl ${
              pulseGlow
                ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-cyan-400 shadow-[0_0_40px_rgba(244,63,94,0.7)] scale-105'
                : 'bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400 shadow-[0_0_25px_rgba(6,182,212,0.6)] scale-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 animate-spin text-slate-950" />
              <span>TAP TO ENTER ARENA</span>
              <ChevronRight className="w-6 h-6 stroke-[3] group-hover:translate-x-1.5 transition-transform" />
            </div>
          </button>

          <span className="text-[11px] font-mono text-slate-400 tracking-widest mt-3 uppercase animate-pulse">
            [ Click anywhere to initialize battle deck ]
          </span>
        </div>
      </div>

      {/* Bottom Footer Credits */}
      <div className="relative z-10 w-full max-w-4xl flex items-center justify-between text-xs text-slate-400 font-mono pb-2 border-t border-slate-800/60 pt-3">
        <span>© 2026 DUELVERSE ARENA</span>
        <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
          <Volume2 className="w-3.5 h-3.5" />
          AUDIO ENABLED
        </span>
      </div>
    </div>
  );
};
