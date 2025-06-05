const SUITS = ['H', 'D', 'C', 'S'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]; // 11=J, 12=Q, 13=K, 15=A

const JOKERS = [
  { v: 50, s: 'B' },
  { v: 50, s: 'R' },
];

export function initializeDeck(players) {
  // Create standard 52 + 2 Joker deck
  let deck = SUITS.flatMap((s) =>
    VALUES.map((v) => ({
      v,
      s
    })),
  );

  // Add Jokers
  deck.push(...JOKERS);

  // Shuffle the deck
  deck = shuffleArray([...deck]);

  // Ensure no 7 is at top or bottom of deck
  deck = ensureNo7AtEnds(deck);

  // Deal cards to players (7 cards each)
  const playerHands = {
    [players[0]]: deck
      .splice(0, 7)
      .map((card) => card),
    [players[1]]: deck
      .splice(0, 7)
      .map((card) => card),
  };

  // Get cutting card (last card in deck)
  const cuttingCard = deck.pop();

  return {
    deck,
    playerHands,
    cuttingCard,
  };
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function ensureNo7AtEnds(deck) {
  const deckCopy = [...deck];
  const lastIndex = deckCopy.length - 1;
  
  // Find all non-7 cards in the middle positions (not first or last)
  const middleNon7Indices = [];
  for (let i = 1; i < lastIndex; i++) {
    if (deckCopy[i].v !== 7) {
      middleNon7Indices.push(i);
    }
  }
  
  // If we don't have enough non-7 cards in the middle, something is very wrong
  // (This should never happen with a normal deck)
  if (middleNon7Indices.length < 2) {
    console.warn('Warning: Not enough non-7 cards to ensure 7s are not at ends');
    return deckCopy;
  }
  
  let swapIndex = 0; // Track which middle non-7 card to use next
  
  // Check if first card is a 7
  if (deckCopy[0].v === 7 && swapIndex < middleNon7Indices.length) {
    const swapPosition = middleNon7Indices[swapIndex];
    [deckCopy[0], deckCopy[swapPosition]] = [deckCopy[swapPosition], deckCopy[0]];
    swapIndex++;
  }
  
  // Check if last card is a 7
  if (deckCopy[lastIndex].v === 7 && swapIndex < middleNon7Indices.length) {
    const swapPosition = middleNon7Indices[swapIndex];
    [deckCopy[lastIndex], deckCopy[swapPosition]] = [deckCopy[swapPosition], deckCopy[lastIndex]];
    swapIndex++;
  }
  
  return deckCopy;
}