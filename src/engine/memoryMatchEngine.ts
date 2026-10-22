import type { MemoryMatchState, MemoryCard } from '../types/game';

const ICONS = ['🚀', '⚡', '💎', '🔥', '👾', '👑', '🎯', '🌟'];

export function createMemoryMatchInitialState(playerUids: string[]): MemoryMatchState {
  const cards: MemoryCard[] = [];
  let id = 0;

  ICONS.forEach((icon, pairId) => {
    cards.push({ id: id++, pairId, icon, isMatched: false, matchedBy: null });
    cards.push({ id: id++, pairId, icon, isMatched: false, matchedBy: null });
  });

  // Deterministic shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const scores: Record<string, number> = {};
  const playerFlips: Record<string, number[]> = {};
  playerUids.forEach((uid) => {
    scores[uid] = 0;
    playerFlips[uid] = [];
  });

  return {
    cards,
    playerFlips,
    scores
  };
}

export function flipMemoryCard(
  state: MemoryMatchState,
  playerUid: string,
  cardIndex: number
): {
  newState: MemoryMatchState;
  matched: boolean;
  mismatched: boolean;
  gameComplete: boolean;
  winnerUid: string | 'draw' | null;
} {
  const card = state.cards[cardIndex];
  if (!card || card.isMatched) {
    return { newState: state, matched: false, mismatched: false, gameComplete: false, winnerUid: null };
  }

  const currentFlips = state.playerFlips[playerUid] || [];
  if (currentFlips.includes(cardIndex)) {
    return { newState: state, matched: false, mismatched: false, gameComplete: false, winnerUid: null };
  }

  if (currentFlips.length >= 2) {
    // Already has 2 cards flipped waiting
    return { newState: state, matched: false, mismatched: false, gameComplete: false, winnerUid: null };
  }

  const nextFlips = [...currentFlips, cardIndex];

  if (nextFlips.length === 1) {
    // Just first card flipped
    return {
      newState: {
        ...state,
        playerFlips: { ...state.playerFlips, [playerUid]: nextFlips }
      },
      matched: false,
      mismatched: false,
      gameComplete: false,
      winnerUid: null
    };
  }

  // Second card flipped! Check pair
  const [firstIdx, secondIdx] = nextFlips;
  const firstCard = state.cards[firstIdx];
  const secondCard = state.cards[secondIdx];

  if (firstCard.pairId === secondCard.pairId) {
    // Match! Lock cards
    const nextCards = state.cards.map((c, i) => {
      if (i === firstIdx || i === secondIdx) {
        return { ...c, isMatched: true, matchedBy: playerUid };
      }
      return c;
    });

    const nextScores = {
      ...state.scores,
      [playerUid]: (state.scores[playerUid] || 0) + 1
    };

    const allMatched = nextCards.every((c) => c.isMatched);
    let winnerUid: string | 'draw' | null = null;
    if (allMatched) {
      const uids = Object.keys(nextScores);
      if (uids.length >= 2) {
        const s1 = nextScores[uids[0]] || 0;
        const s2 = nextScores[uids[1]] || 0;
        winnerUid = s1 > s2 ? uids[0] : s2 > s1 ? uids[1] : 'draw';
      } else {
        winnerUid = playerUid;
      }
    }

    return {
      newState: {
        cards: nextCards,
        playerFlips: { ...state.playerFlips, [playerUid]: [] },
        scores: nextScores
      },
      matched: true,
      mismatched: false,
      gameComplete: allMatched,
      winnerUid
    };
  }

  // Mismatch
  return {
    newState: {
      ...state,
      playerFlips: { ...state.playerFlips, [playerUid]: nextFlips }
    },
    matched: false,
    mismatched: true,
    gameComplete: false,
    winnerUid: null
  };
}

export function clearPlayerFlips(state: MemoryMatchState, playerUid: string): MemoryMatchState {
  return {
    ...state,
    playerFlips: { ...state.playerFlips, [playerUid]: [] }
  };
}
