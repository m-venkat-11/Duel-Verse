import type { LuckyDiceState } from '../types/game';

export function createLuckyDiceInitialState(
  playerUids: string[],
  targetWins: number = 3,
  initialDiceCount: number = 3
): LuckyDiceState {
  const roundScores: Record<string, number> = {};
  playerUids.forEach((uid) => {
    roundScores[uid] = 0;
  });

  const p1 = playerUids[0] || 'player';
  const p2 = playerUids[1] || (p1 === 'bot_rival' ? 'player' : 'bot_rival');
  if (!roundScores[p1]) roundScores[p1] = 0;
  if (!roundScores[p2]) roundScores[p2] = 0;

  const validDiceCount = Math.max(1, Math.min(5, initialDiceCount));
  const initialRoll = Array.from({ length: validDiceCount }, () => Math.floor(Math.random() * 6) + 1);

  // Default initial bets for both players so the game starts immediately!
  const defaultP1 = Array.from({ length: validDiceCount }, (_, i) => ((i * 2 + 1) % 6) + 1);
  const defaultP2 = Array.from({ length: validDiceCount }, (_, i) => ((i * 2 + 2) % 6) + 1);

  return {
    diceCount: validDiceCount,
    phase: 'rolling',
    currentTurn: p1,
    guesses: {
      [p1]: defaultP1,
      [p2]: defaultP2
    },
    cleared: {
      [p1]: new Array(validDiceCount).fill(false),
      [p2]: new Array(validDiceCount).fill(false)
    },
    currentRoll: initialRoll,
    roundWinnerUid: null,
    roundScores,
    targetWins,
    rollCount: 0,
    lastRolledBy: null,
    recentMatches: []
  };
}

export function setLuckyDiceCount(state: LuckyDiceState, diceCount: number): LuckyDiceState {
  const clamped = Math.max(1, Math.min(5, diceCount));
  const initialRoll = Array.from({ length: clamped }, () => Math.floor(Math.random() * 6) + 1);

  const newGuesses: Record<string, number[]> = {};
  const newCleared: Record<string, boolean[]> = {};

  Object.keys(state.guesses).forEach((uid) => {
    const existing = state.guesses[uid] || [];
    const updated = [...existing];
    while (updated.length < clamped) updated.push(Math.floor(Math.random() * 6) + 1);
    newGuesses[uid] = updated.slice(0, clamped);
    newCleared[uid] = new Array(clamped).fill(false);
  });

  return {
    ...state,
    diceCount: clamped,
    guesses: newGuesses,
    cleared: newCleared,
    currentRoll: initialRoll
  };
}

export function updateLuckyDiceBet(
  state: LuckyDiceState,
  playerUid: string,
  dieIndex: number,
  newBet: number
): LuckyDiceState {
  const existingGuesses = [...(state.guesses[playerUid] || new Array(state.diceCount).fill(1))];
  existingGuesses[dieIndex] = Math.max(1, Math.min(6, newBet));

  return {
    ...state,
    guesses: {
      ...state.guesses,
      [playerUid]: existingGuesses
    }
  };
}

export function submitLuckyDiceGuesses(
  state: LuckyDiceState,
  playerUid: string,
  guesses: number[],
  playerUids: string[]
): LuckyDiceState {
  const validGuesses = guesses.slice(0, state.diceCount).map((g) => Math.max(1, Math.min(6, g)));
  const newGuesses = { ...state.guesses, [playerUid]: validGuesses };
  const newCleared = { ...state.cleared, [playerUid]: new Array(state.diceCount).fill(false) };

  const p1 = playerUids[0] || playerUid;
  const p2 = playerUids[1] || (playerUid === 'bot_rival' ? 'player' : 'bot_rival');

  if ((p2 === 'bot_rival' || p2.startsWith('bot_') || playerUids.length < 2) && !newGuesses[p2]) {
    const botGuesses = Array.from({ length: state.diceCount }, () => Math.floor(Math.random() * 6) + 1);
    newGuesses[p2] = botGuesses;
    newCleared[p2] = new Array(state.diceCount).fill(false);
  }

  return {
    ...state,
    guesses: newGuesses,
    cleared: newCleared,
    phase: 'rolling',
    currentTurn: p1
  };
}

export function rollLuckyDice(
  state: LuckyDiceState,
  playerUid: string,
  playerUids: string[]
): {
  newState: LuckyDiceState;
  roundOver: boolean;
  roundWinnerUid: string | null;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  // Roll fresh 3D dice values (1 to 6)
  const newRoll = Array.from({ length: state.diceCount }, () => Math.floor(Math.random() * 6) + 1);

  const newCleared: Record<string, boolean[]> = {};
  const recentMatches: { uid: string; dieIndex: number; value: number }[] = [];

  // Copy existing cleared arrays
  Object.keys(state.cleared).forEach((uid) => {
    newCleared[uid] = [...(state.cleared[uid] || new Array(state.diceCount).fill(false))];
  });

  // Evaluate matches across players
  Object.keys(state.guesses).forEach((uid) => {
    const playerGuesses = state.guesses[uid] || [];
    if (!newCleared[uid]) newCleared[uid] = new Array(state.diceCount).fill(false);

    for (let i = 0; i < state.diceCount; i++) {
      if (!newCleared[uid][i] && playerGuesses[i] === newRoll[i]) {
        newCleared[uid][i] = true;
        recentMatches.push({ uid, dieIndex: i, value: newRoll[i] });
      }
    }
  });

  const p1 = playerUids[0] || playerUid;
  const p2 = playerUids[1] || (playerUid === 'bot_rival' ? 'player' : 'bot_rival');

  const p1Done = newCleared[p1]?.every((c) => c === true);
  const p2Done = newCleared[p2]?.every((c) => c === true);

  let roundWinnerUid: string | null = null;
  let roundOver = false;

  if (p1Done && p2Done) {
    // Both cleared on the exact same roll: active roller gets tiebreaker advantage
    roundWinnerUid = playerUid;
    roundOver = true;
  } else if (p1Done) {
    roundWinnerUid = p1;
    roundOver = true;
  } else if (p2Done) {
    roundWinnerUid = p2;
    roundOver = true;
  }

  const newScores = { ...state.roundScores };
  let matchOver = false;
  let matchWinnerUid: string | null = null;

  if (roundOver && roundWinnerUid) {
    newScores[roundWinnerUid] = (newScores[roundWinnerUid] || 0) + 1;
    if (newScores[roundWinnerUid] >= state.targetWins) {
      matchOver = true;
      matchWinnerUid = roundWinnerUid;
    }
  }

  // Next turn passes to opponent
  const nextTurn = playerUid === p1 ? p2 : p1;

  const newState: LuckyDiceState = {
    ...state,
    currentRoll: newRoll,
    cleared: newCleared,
    currentTurn: roundOver ? state.currentTurn : nextTurn,
    lastRolledBy: playerUid,
    rollCount: state.rollCount + 1,
    phase: roundOver ? 'round_end' : 'rolling',
    roundWinnerUid,
    roundScores: newScores,
    recentMatches
  };

  return {
    newState,
    roundOver,
    roundWinnerUid,
    matchOver,
    matchWinnerUid
  };
}

export function resetLuckyDiceNextRound(state: LuckyDiceState, playerUids: string[]): LuckyDiceState {
  const p1 = playerUids[0] || 'player';
  const initialRoll = Array.from({ length: state.diceCount }, () => Math.floor(Math.random() * 6) + 1);

  // Preserve existing guesses so players don't have to re-enter setup!
  const newCleared: Record<string, boolean[]> = {};
  Object.keys(state.guesses).forEach((uid) => {
    newCleared[uid] = new Array(state.diceCount).fill(false);
  });

  return {
    ...state,
    phase: 'rolling',
    currentTurn: p1,
    cleared: newCleared,
    currentRoll: initialRoll,
    roundWinnerUid: null,
    rollCount: 0,
    lastRolledBy: null,
    recentMatches: []
  };
}
