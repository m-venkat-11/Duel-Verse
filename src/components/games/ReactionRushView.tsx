import React, { useEffect, useState } from 'react';
import type { ReactionRushState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { Zap, AlertOctagon, CheckCircle2 } from 'lucide-react';

interface ReactionRushViewProps {
  room: AuthoritativeRoomState<ReactionRushState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ReactionRushView: React.FC<ReactionRushViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const [isSignalActive, setIsSignalActive] = useState<boolean>(false);
  const now = Date.now();

  useEffect(() => {
    if (gameState.phase === 'countdown') {
      const remainingMs = gameState.signalScheduledAt - Date.now();
      if (remainingMs <= 0) {
        setIsSignalActive(true);
        soundService.playSignalAlert();
      } else {
        setIsSignalActive(false);
        const timer = setTimeout(() => {
          setIsSignalActive(true);
          soundService.playSignalAlert();
        }, remainingMs);
        return () => clearTimeout(timer);
      }
    } else {
      setIsSignalActive(false);
    }
  }, [gameState.phase, gameState.signalScheduledAt]);

  const handleTap = () => {
    if (gameState.phase === 'round_result') return;

    const tapTimestamp = Date.now();
    soundService.playClick();
    onDispatchAction('REACTION_TAP', { tapTimestamp });
  };

  const myReactionMs = gameState.reactionTimes[playerUid];
  const myFalseStart = gameState.falseStarts[playerUid];
  const isWinner = gameState.roundWinner === playerUid;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* Round & Target Info */}
      <div className="mb-4 flex items-center justify-between w-full px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-bold font-['Outfit']">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>ROUND {gameState.round} (Target: {gameState.targetWins} Wins)</span>
        </div>
        <div className="text-emerald-400 font-mono">
          {Object.entries(gameState.roundWins)
            .map(([uid, wins]) => `${uid === playerUid ? 'YOU' : 'RIVAL'}: ${wins}`)
            .join(' | ')}
        </div>
      </div>

      {/* Main Reflex Pad */}
      <div
        onClick={handleTap}
        className={`w-full aspect-[4/3] rounded-3xl flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer shadow-2xl transition-all duration-100 border-4 ${
          gameState.phase === 'round_result'
            ? myFalseStart
              ? 'bg-red-950/90 border-red-500 text-red-200'
              : isWinner
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-200'
              : 'bg-slate-900 border-slate-700 text-slate-300'
            : isSignalActive
            ? 'bg-emerald-500 border-white text-slate-950 scale-[1.02] shadow-emerald-500/50 animate-pulse'
            : 'bg-rose-950/90 border-rose-600/80 text-rose-200 hover:bg-rose-900/90'
        }`}
      >
        {gameState.phase === 'round_result' ? (
          <div className="flex flex-col items-center">
            {myFalseStart ? (
              <>
                <AlertOctagon className="w-16 h-16 text-red-400 mb-2 animate-bounce" />
                <h3 className="text-2xl font-black font-['Outfit'] text-red-400">
                  FALSE START!
                </h3>
                <p className="text-xs text-red-300 mt-1">
                  You tapped before the green signal!
                </p>
              </>
            ) : isWinner ? (
              <>
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-2 animate-bounce" />
                <h3 className="text-2xl font-black font-['Outfit'] text-emerald-300">
                  FASTEST REFLEX!
                </h3>
                {myReactionMs && (
                  <p className="text-4xl font-black font-mono mt-2 text-white tabular-nums">
                    {myReactionMs} <span className="text-xl">ms</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <Zap className="w-16 h-16 text-slate-400 mb-2" />
                <h3 className="text-2xl font-black font-['Outfit'] text-slate-300">
                  OPPONENT WAS QUICKER!
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Next round beginning shortly...
                </p>
              </>
            )}
          </div>
        ) : isSignalActive ? (
          <div className="flex flex-col items-center">
            <Zap className="w-20 h-20 text-slate-950 mb-2 fill-current" />
            <h2 className="text-4xl sm:text-5xl font-black font-['Outfit'] text-slate-950 tracking-tight">
              TAP NOW!
            </h2>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full border-4 border-rose-400 border-t-transparent animate-spin mb-4" />
            <h3 className="text-2xl sm:text-3xl font-black font-['Outfit'] text-rose-300">
              WAIT FOR GREEN...
            </h3>
            <p className="text-xs text-rose-400/80 mt-1">
              Do not tap yet or you will forfeit the round!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
