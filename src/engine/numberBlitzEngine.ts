import type { NumberBlitzState, MathQuestion } from '../types/game';

function generateQuestions(count: number = 30): MathQuestion[] {
  const questions: MathQuestion[] = [];
  const operators = ['+', '-', '*'];

  for (let i = 0; i < count; i++) {
    const op = operators[Math.floor(Math.random() * operators.length)];
    let a = 0;
    let b = 0;
    let ans = 0;

    if (op === '+') {
      a = Math.floor(10 + Math.random() * 40);
      b = Math.floor(10 + Math.random() * 40);
      ans = a + b;
    } else if (op === '-') {
      a = Math.floor(20 + Math.random() * 60);
      b = Math.floor(5 + Math.random() * (a - 5));
      ans = a - b;
    } else {
      a = Math.floor(3 + Math.random() * 9);
      b = Math.floor(3 + Math.random() * 9);
      ans = a * b;
    }

    // Generate 3 unique wrong options near answer
    const optionsSet = new Set<number>([ans]);
    while (optionsSet.size < 4) {
      const delta = (Math.random() > 0.5 ? 1 : -1) * Math.floor(1 + Math.random() * 8);
      const wrong = ans + delta;
      if (wrong !== ans && wrong >= 0) {
        optionsSet.add(wrong);
      }
    }

    const options = Array.from(optionsSet).sort(() => Math.random() - 0.5);
    const correctIndex = options.indexOf(ans);

    questions.push({
      id: `q_${i}`,
      expression: `${a} ${op === '*' ? '×' : op} ${b}`,
      options,
      correctIndex
    });
  }

  return questions;
}

export function createNumberBlitzInitialState(playerUids: string[], durationSec: number = 45): NumberBlitzState {
  const playerQuestionIndex: Record<string, number> = {};
  const playerScores: Record<string, number> = {};
  const streaks: Record<string, number> = {};

  playerUids.forEach((uid) => {
    playerQuestionIndex[uid] = 0;
    playerScores[uid] = 0;
    streaks[uid] = 0;
  });

  return {
    timeRemaining: durationSec,
    questions: generateQuestions(30),
    playerQuestionIndex,
    playerScores,
    streaks,
    endTime: Date.now() + durationSec * 1000
  };
}

export function submitBlitzAnswer(
  state: NumberBlitzState,
  playerUid: string,
  chosenIndex: number
): {
  newState: NumberBlitzState;
  isCorrect: boolean;
  scoreDelta: number;
} {
  const currentIdx = state.playerQuestionIndex[playerUid] || 0;
  const question = state.questions[currentIdx];

  if (!question) {
    return { newState: state, isCorrect: false, scoreDelta: 0 };
  }

  const isCorrect = chosenIndex === question.correctIndex;
  const currentStreak = state.streaks[playerUid] || 0;
  let scoreDelta = 0;
  let nextStreak = 0;

  if (isCorrect) {
    scoreDelta = 100 + currentStreak * 15;
    nextStreak = currentStreak + 1;
  } else {
    scoreDelta = -30;
    nextStreak = 0;
  }

  const nextScores = {
    ...state.playerScores,
    [playerUid]: Math.max(0, (state.playerScores[playerUid] || 0) + scoreDelta)
  };

  const nextIndices = {
    ...state.playerQuestionIndex,
    [playerUid]: currentIdx + 1
  };

  const nextStreaks = {
    ...state.streaks,
    [playerUid]: nextStreak
  };

  return {
    newState: {
      ...state,
      playerScores: nextScores,
      playerQuestionIndex: nextIndices,
      streaks: nextStreaks
    },
    isCorrect,
    scoreDelta
  };
}
