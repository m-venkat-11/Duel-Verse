import React, { useState, useEffect } from 'react';
import { soundService } from '../services/sound';

interface IntroScreenProps {
  onEnter: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onEnter }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Play initial subtle startup chime
    soundService.playCountdown?.(0);

    // Smooth 2.4-second progress animation
    const startTime = Date.now();
    const duration = 2400; // 2.4 seconds total intro duration

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (elapsed >= duration - 350) {
        setIsExiting(true);
      }

      if (elapsed >= duration) {
        clearInterval(progressInterval);
        onEnter();
      }
    }, 30);

    return () => clearInterval(progressInterval);
  }, [onEnter]);

  const handleInstantSkip = () => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(onEnter, 250);
  };

  return (
    <div
      onClick={handleInstantSkip}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#04060c] select-none cursor-pointer transition-all duration-500 overflow-hidden ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Animated Cyber Matrix & Radial Neon Atmosphere */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_40%,rgba(139,92,246,0.28),rgba(0,0,0,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_60%,rgba(6,182,212,0.22),rgba(0,0,0,0))]" />

        {/* Ambient Perspective Neon Floor Grid */}
        <div
          className="absolute bottom-0 inset-x-0 h-80 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(139, 92, 246, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(6, 182, 212, 0.25) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            transform: 'perspective(500px) rotateX(65deg)',
            transformOrigin: 'bottom center',
          }}
        />

        {/* Pulsing Backlight Blobs */}
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-violet-600/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-cyan-500/20 blur-3xl animate-pulse delay-500" />
      </div>

      {/* Main Center Stage: Logo & App Title Only */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 max-w-xl animate-in fade-in zoom-in-95 duration-700">
        {/* DuelVerse Custom Logo Emblem */}
        <div className="relative mb-6">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-cyan-500 via-violet-600 to-amber-500 opacity-70 blur-2xl animate-pulse" />
          <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden border-2 border-cyan-400/80 shadow-[0_0_50px_rgba(6,182,212,0.5)] bg-slate-950 flex items-center justify-center">
            <img
              src="/assets/duelverse_logo.jpg"
              alt="DuelVerse Logo"
              className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>

        {/* Cinematic App Name */}
        <h1 className="text-6xl sm:text-8xl md:text-9xl font-black font-['Outfit'] tracking-tight text-white uppercase leading-none drop-shadow-[0_0_40px_rgba(139,92,246,0.7)]">
          DUEL<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-300 to-amber-300">VERSE</span>
        </h1>

        {/* Subtle Cyber Neon Loading Line (2-3s indicator) */}
        <div className="w-48 sm:w-64 h-1.5 bg-slate-800/80 rounded-full mt-8 overflow-hidden relative border border-white/10 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-400 rounded-full shadow-[0_0_15px_#22d3ee] transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
