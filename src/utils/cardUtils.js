const SUITS = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]; // 11=J, 12=Q, 13=K, 15=A

const JOKERS = [
  { id: 'BLACK_50', value: 50, suit: 'BLACK', type: 'pile' },
  { id: 'RED_50', value: 50, suit: 'RED', type: 'pile' },
];

export function initializeDeck(players) {
  // Create standard 52 + 2 Joker deck
  let deck = SUITS.flatMap((suit) =>
    VALUES.map((value) => ({
      id: `${suit}_${value}`,
      value,
      suit,
      type: 'pile',
    })),
  );

  // Add Jokers
  deck.push(...JOKERS);

  // Shuffle the deck
  deck = shuffleArray([...deck]);

  // Deal cards to players (7 cards each)
  const playerHands = {
    [players[0]]: deck
      .splice(0, 7)
      .map((card) => ({ ...card, type: 'player' })),
    [players[1]]: deck
      .splice(0, 7)
      .map((card) => ({ ...card, type: 'player' })),
  };

  // Get cutting card
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
