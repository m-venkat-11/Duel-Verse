import React, { useEffect, useState } from 'react';
import { soundService } from '../services/sound';

interface CountdownOverlayProps {
  onComplete: () => void;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ onComplete }) => {
  const [count, setCount] = useState<number>(3);

  useEffect(() => {
    soundService.playCountdown(count);

    if (count > 0) {
      const timer = setTimeout(() => {
        setCount((prev) => prev - 1);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      // 0 means "DUEL!"
      const endTimer = setTimeout(() => {
        onComplete();
      }, 700);
      return () => clearTimeout(endTimer);
    }
  }, [count, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md pointer-events-none">
      <div className="flex flex-col items-center">
        <div
          key={count}
          style={{ animation: 'countdownZoom 0.9s cubic-bezier(0.16, 1, 0.3, 1)' }}
          className={`font-black font-['Outfit'] tracking-tighter ${
            count > 0
              ? 'text-7xl sm:text-9xl text-transparent bg-clip-text bg-gradient-to-tr from-violet-400 via-cyan-300 to-white'
              : 'text-6xl sm:text-8xl text-transparent bg-clip-text bg-gradient-to-tr from-amber-400 via-rose-400 to-yellow-200'
          }`}
        >
          {count > 0 ? count : 'DUEL!'}
        </div>
        <p className="text-sm font-semibold tracking-widest uppercase text-slate-400 mt-2 font-mono">
          {count > 0 ? 'Get Ready' : 'Fight for Glory!'}
        </p>
      </div>
    </div>
  );
};
