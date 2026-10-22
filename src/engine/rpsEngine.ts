import type { RPSState, RPSChoice } from '../types/game';

export function createRPSInitialState(playerUids: string[], targetWins: number = 3): RPSState {
  const roundScores: Record<string, number> = {};
  playerUids.forEach((uid) => {
    roundScores[uid] = 0;
  });

  return {
    roundNumber: 1,
    targetWins,
    commits: {},
    choices: {},
    roundWinner: null,
    phase: 'choosing',
    timerEnd: Date.now() + 15000,
    roundScores
  };
}

export function evaluateRPSWinner(choiceA: RPSChoice, choiceB: RPSChoice, uidA: string, uidB: string): string | 'draw' {
  if (choiceA === choiceB) return 'draw';
  if (
    (choiceA === 'rock' && choiceB === 'scissors') ||
    (choiceA === 'scissors' && choiceB === 'paper') ||
    (choiceA === 'paper' && choiceB === 'rock')
  ) {
    return uidA;
  }
  return uidB;
}

export function commitRPSChoice(
  state: RPSState,
  playerUid: string,
  choice: RPSChoice,
  playerUids: string[]
): {
  newState: RPSState;
  roundOver: boolean;
  roundWinnerUid: string | 'draw' | null;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  if (state.phase !== 'choosing') {
    return { newState: state, roundOver: false, roundWinnerUid: null, matchOver: false, matchWinnerUid: null };
  }

  // Register commit
  const newCommits = { ...state.commits, [playerUid]: 'COMMITTED' };
  const newChoices = { ...state.choices, [playerUid]: choice };

  const [p1, p2] = playerUids;
  const bothCommitted = Boolean(p1 && p2 && newChoices[p1] && newChoices[p2]);

  if (!bothCommitted) {
    // Only one player committed so far: mask choice from opponent
    return {
      newState: {
        ...state,
        commits: newCommits,
        choices: newChoices
      },
      roundOver: false,
      roundWinnerUid: null,
      matchOver: false,
      matchWinnerUid: null
    };
  }

  // Both committed! Reveal and evaluate!
  const c1 = newChoices[p1] as RPSChoice;
  const c2 = newChoices[p2] as RPSChoice;
  const roundWinner = evaluateRPSWinner(c1, c2, p1, p2);

  const updatedRoundScores = { ...state.roundScores };
  if (roundWinner !== 'draw' && roundWinner) {
    updatedRoundScores[roundWinner] = (updatedRoundScores[roundWinner] || 0) + 1;
  }

  const p1Wins = updatedRoundScores[p1] || 0;
  const p2Wins = updatedRoundScores[p2] || 0;
  const matchOver = p1Wins >= state.targetWins || p2Wins >= state.targetWins;
  const matchWinnerUid = p1Wins >= state.targetWins ? p1 : p2Wins >= state.targetWins ? p2 : null;

  const newState: RPSState = {
    ...state,
    commits: newCommits,
    choices: newChoices,
    roundWinner,
    phase: 'revealed',
    roundScores: updatedRoundScores
  };

  return {
    newState,
    roundOver: true,
    roundWinnerUid: roundWinner,
    matchOver,
    matchWinnerUid
  };
}

export function resetRPSNextRound(state: RPSState): RPSState {
  return {
    ...state,
    roundNumber: state.roundNumber + 1,
    commits: {},
    choices: {},
    roundWinner: null,
    phase: 'choosing',
    timerEnd: Date.now() + 15000
  };
}
