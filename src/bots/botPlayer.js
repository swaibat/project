// botPlayer.js
// import { generateId } from './wsUtil.js';

import { generateId } from '../websocket/wsUtil.js';

const BOT_DELAY_MS = 1000; // Bot's thinking time between moves

// Constants matching frontend
const CARD_TYPE = {
  PLAYER: 1,
  OPPONENT: 2,
  PILE: 3,
  PLAYED: 4,
};

const PENALTY_CARD_VALUES = [2, 3, 50]; // Same as frontend

/**
 * Create a bot player with a unique ID
 * @returns {Object} Bot player object
 */
export const createBotPlayer = () => {
  const botId = `bot_${generateId().substring(0, 8)}`;
  return {
    id: botId,
    username: `Bot_${botId.substring(4, 8)}`,
    isBot: true,
  };
};

/**
 * Start a game with a bot
 * @param {Object} player - Human player object
 * @param {Object} botPlayer - Bot player object
 * @param {Map} clients - WebSocket clients map
 * @returns {Promise<Object>} GameState object
 */
export const startBotGame = async (player, botPlayer, clients) => {
  const { initializeDeck } = await import('../utils/cardUtils.js');
  const { GameState } = await import('../models/GameState.js');

  const { deck, playerHands, cuttingCard } = initializeDeck([
    player.id,
    botPlayer.id,
  ]);

  const gameState = new GameState({
    players: playerHands,
    status: 'ACTIVE',
    userId: player.id,
    currentTurn: player.id, // Human player starts
    cuttingCard,
    deck,
    playedCards: [],
    currentCard: null,
    chosenSuit: null,
    isBot: true,
    botId: botPlayer.id,
    uid: player.id,
  });

  await gameState.save();

  // Send game start to human player
  const playerWs = clients.get(player.id);
  if (playerWs) {
    playerWs.send(
      JSON.stringify({
        type: 'GAME_REQUEST_ACCEPTED',
        gameId: gameState.gameId,
        gameState,
        isBot: true,
        botId: botPlayer.id,
      }),
    );
  }

  return gameState;
};

/**
 * Handle bot turn in the game
 * @param {string} gameId - Game ID
 * @param {Map} clients - WebSocket clients map
 * @returns {Promise<void>}
 */
export const handleBotTurn = async (gameId, clients) => {
  const { GameState } = await import('../models/GameState.js');
  const gameState = await GameState.findOne({ gameId });

  if (!gameState || !gameState.isBot || !gameState.botId) {
    return;
  }

  // If it's not bot's turn, exit
  if (gameState.currentTurn !== gameState.botId) {
    return;
  }

  // Wait for "thinking" time
  await new Promise((resolve) => setTimeout(resolve, BOT_DELAY_MS));

  const botHand = gameState.players.get(gameState.botId);
  const lastPlayedCard =
    gameState.playedCards.length > 0
      ? gameState.playedCards[gameState.playedCards.length - 1]
      : null;
  const uid = gameState.uid;
  const botId = gameState.botId;

  // Check if there's an active penalty
  const penaltyActive = isPenaltyActive(lastPlayedCard);
  const currentPenalty = penaltyActive ? calculatePenalty(lastPlayedCard) : 0;

  // First, try to find a valid card to play
  const playableCard = findPlayableCard(
    botHand,
    lastPlayedCard,
    gameState.chosenSuit,
    penaltyActive,
    currentPenalty,
  );

  const playerWs = clients.get(uid);
  if (!playerWs) return;

  if (playableCard) {
    // Bot has a valid card to play
    await playBotCard(
      playableCard,
      botId,
      uid,
      gameState,
      playerWs,
      penaltyActive,
      currentPenalty,
    );
  } else if (penaltyActive) {
    // Bot can't counter penalty, must draw cards
    await botDrawPenaltyCards(botId, uid, gameState, playerWs, currentPenalty);
  } else {
    // Bot has no valid card, must draw from pile
    await botDrawCard(botId, uid, gameState, playerWs);
  }
};

/**
 * Check if there's an active penalty based on last played card
 * @param {Object} lastPlayedCard - Last played card
 * @returns {boolean} True if penalty is active
 */
const isPenaltyActive = (lastPlayedCard) => {
  if (!lastPlayedCard) return false;
  return PENALTY_CARD_VALUES.includes(lastPlayedCard.value);
};

/**
 * Calculate current penalty value
 * @param {Object} lastPlayedCard - Last played card
 * @returns {number} Penalty value
 */
const calculatePenalty = (lastPlayedCard) => {
  if (!lastPlayedCard) return 0;
  return lastPlayedCard.value === 50 ? 5 : lastPlayedCard.value;
};

/**
 * Find a valid card for bot to play
 * @param {Array} botHand - Bot's hand of cards
 * @param {Object} lastPlayedCard - Last played card
 * @param {string} chosenSuit - Currently chosen suit
 * @param {boolean} penaltyActive - Whether there's an active penalty
 * @param {number} currentPenalty - Current penalty value
 * @returns {Object|null} Valid card to play or null
 */
const findPlayableCard = (
  botHand,
  lastPlayedCard,
  chosenSuit,
  penaltyActive,
  currentPenalty,
) => {
  if (!botHand || botHand.length === 0) return null;
  if (!lastPlayedCard) return botHand[0]; // Play any card if no card is played yet

  // First, try to find a card that cancels or adds to penalty if penalty is active
  if (penaltyActive) {
    // Look for joker (value 15, spades) first to cancel penalty
    const joker = botHand.find(
      (card) => card.value === 15 && card.suit === 'spades',
    );
    if (joker) return joker;

    // Look for cards with same penalty value
    const samePenaltyCards = botHand.filter(
      (card) =>
        PENALTY_CARD_VALUES.includes(card.value) &&
        (card.suit === lastPlayedCard.suit ||
          card.value === lastPlayedCard.value),
    );
    if (samePenaltyCards.length > 0) return samePenaltyCards[0];

    // Look for cards with matching color
    const sameColorCards = botHand.filter((card) => {
      if (
        card.suit === 'red' &&
        (lastPlayedCard.suit === 'hearts' || lastPlayedCard.suit === 'diamonds')
      )
        return true;
      if (
        card.suit === 'black' &&
        (lastPlayedCard.suit === 'spades' || lastPlayedCard.suit === 'clubs')
      )
        return true;
      return false;
    });
    if (sameColorCards.length > 0) return sameColorCards[0];
  }

  // Check for special card - joker (value 15)
  const joker = botHand.find((card) => card.value === 15);
  if (joker) return joker;

  // Check for cards that match chosen suit
  if (chosenSuit) {
    const suitMatches = botHand.filter((card) => {
      if (card.suit === chosenSuit) return true;
      if (
        card.suit === 'red' &&
        (chosenSuit === 'hearts' || chosenSuit === 'diamonds')
      )
        return true;
      if (
        card.suit === 'black' &&
        (chosenSuit === 'spades' || chosenSuit === 'clubs')
      )
        return true;
      return false;
    });
    if (suitMatches.length > 0) return suitMatches[0];
  }

  // Check for cards that match suit or value
  const matches = botHand.filter(
    (card) =>
      card.suit === lastPlayedCard.suit ||
      card.value === lastPlayedCard.value ||
      (card.suit === 'red' &&
        (lastPlayedCard.suit === 'hearts' ||
          lastPlayedCard.suit === 'diamonds')) ||
      (card.suit === 'black' &&
        (lastPlayedCard.suit === 'spades' || lastPlayedCard.suit === 'clubs')),
  );

  if (matches.length > 0) return matches[0];

  return null; // No valid card found
};

/**
 * Play a card from bot's hand
 * @param {Object} card - Card to play
 * @param {string} botId - Bot player ID
 * @param {string} uid - Human player ID
 * @param {Object} gameState - Game state
 * @param {Object} playerWs - Player's WebSocket
 * @param {boolean} penaltyActive - Whether there's an active penalty
 * @param {number} currentPenalty - Current penalty value
 */
const playBotCard = async (
  card,
  botId,
  uid,
  gameState,
  playerWs,
  penaltyActive,
  currentPenalty,
) => {
  // Remove card from bot's hand
  const botHand = gameState.players.get(botId);
  const cardIndex = botHand.findIndex((c) => c.id === card.id);
  if (cardIndex === -1) return;

  botHand.splice(cardIndex, 1);

  // Add card to played cards
  gameState.playedCards.push({ ...card, type: 'played' });
  gameState.currentCard = card;

  // Choose suit for special cards
  let selectedSuit = card.suit;
  if (
    card.value === 15 ||
    (card.value === 7 && card.suit === gameState.cuttingCard.suit)
  ) {
    // Bot chooses a suit (simplified logic: choose the most common suit in bot's hand)
    const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
    botHand.forEach((c) => {
      if (c.suit in suitCounts) suitCounts[c.suit]++;
    });

    const mostCommonSuit = Object.entries(suitCounts).sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    selectedSuit = mostCommonSuit;
    gameState.chosenSuit = mostCommonSuit;
  }

  // Update turn
  gameState.currentTurn = uid;

  // Check for win condition
  if (botHand.length === 0) {
    gameState.winner = botId;
    gameState.status = 'COMPLETED';

    await gameState.save();

    playerWs.send(
      JSON.stringify({
        type: 'WIN',
        gameState,
        from: botId,
        to: uid,
        winningCard: card,
      }),
    );
    return;
  }

  await gameState.save();

  // Determine if new penalty is active
  const newPenaltyActive = PENALTY_CARD_VALUES.includes(card.value);
  const newPenaltyValue = card.value === 50 ? 5 : card.value;

  // Special case for spade joker canceling penalty
  if (card.value === 15 && card.suit === 'spades' && penaltyActive) {
    playerWs.send(
      JSON.stringify({
        type: 'MOVE',
        data: {
          from: botId,
          to: uid,
          card,
          action: 'play',
          penaltyActive: false,
          currentPenalty: 0,
          selectedSuit,
        },
      }),
    );
    return;
  }

  // Send the move to the player
  playerWs.send(
    JSON.stringify({
      type: 'MOVE',
      data: {
        from: botId,
        to: uid,
        card,
        action: 'play',
        penaltyActive: newPenaltyActive,
        currentPenalty: newPenaltyActive ? newPenaltyValue : 0,
        selectedSuit,
      },
    }),
  );
};

/**
 * Bot draws penalty cards
 * @param {string} botId - Bot player ID
 * @param {string} uid - Human player ID
 * @param {Object} gameState - Game state
 * @param {Object} playerWs - Player's WebSocket
 * @param {number} penaltyCount - Number of cards to draw
 */
const botDrawPenaltyCards = async (
  botId,
  uid,
  gameState,
  playerWs,
  penaltyCount,
) => {
  const botHand = gameState.players.get(botId);

  // Draw penalty cards
  for (let i = 0; i < penaltyCount; i++) {
    if (gameState.deck.length === 0) {
      // Reshuffle played cards if deck is empty
      if (gameState.playedCards.length > 1) {
        gameState.deck = gameState.playedCards
          .slice(0, -1)
          .map((c) => ({ ...c, type: 'pile' }));
        gameState.playedCards = [
          gameState.playedCards[gameState.playedCards.length - 1],
        ];
      } else {
        break; // No more cards to draw
      }
    }

    const card = gameState.deck.pop();
    if (card) {
      botHand.push({ ...card, type: 'player' });
    }
  }

  // Reset penalty state
  gameState.currentTurn = uid;

  await gameState.save();

  // Notify player
  playerWs.send(
    JSON.stringify({
      type: 'DRAW',
      data: {
        from: botId,
        to: uid,
        count: penaltyCount,
      },
    }),
  );
};

/**
 * Bot draws a card from the pile
 * @param {string} botId - Bot player ID
 * @param {string} uid - Human player ID
 * @param {Object} gameState - Game state
 * @param {Object} playerWs - Player's WebSocket
 */
const botDrawCard = async (botId, uid, gameState, playerWs) => {
  const botHand = gameState.players.get(botId);

  // Check if deck is empty and needs reshuffling
  if (gameState.deck.length === 0) {
    if (gameState.playedCards.length > 1) {
      gameState.deck = gameState.playedCards
        .slice(0, -1)
        .map((c) => ({ ...c, type: 'pile' }));
      gameState.playedCards = [
        gameState.playedCards[gameState.playedCards.length - 1],
      ];
    } else {
      // No more cards to draw, skip turn
      gameState.currentTurn = uid;
      await gameState.save();

      playerWs.send(
        JSON.stringify({
          type: 'SKIP',
          data: {
            from: botId,
            to: uid,
          },
        }),
      );
      return;
    }
  }

  // Draw a card
  const card = gameState.deck.pop();
  if (card) {
    botHand.push({ ...card, type: 'player' });

    // Check if drawn card can be played
    const lastPlayedCard =
      gameState.playedCards.length > 0
        ? gameState.playedCards[gameState.playedCards.length - 1]
        : null;
    const canPlay = isValidMove(card, lastPlayedCard, gameState.chosenSuit);

    if (canPlay) {
      // Wait a bit to simulate "thinking" before playing the drawn card
      setTimeout(async () => {
        await playBotCard(card, botId, uid, gameState, playerWs, false, 0);
      }, BOT_DELAY_MS);
      return;
    }
  }

  // Switch turn to player
  gameState.currentTurn = uid;
  await gameState.save();

  // Notify player of draw and turn change
  playerWs.send(
    JSON.stringify({
      type: 'DRAW',
      data: {
        from: botId,
        to: uid,
        count: 1,
      },
    }),
  );

  // Send skip message after draw
  playerWs.send(
    JSON.stringify({
      type: 'SKIP',
      data: {
        from: botId,
        to: uid,
      },
    }),
  );
};

/**
 * Check if a move is valid
 * @param {Object} card - Card to play
 * @param {Object} lastPlayedCard - Last played card
 * @param {string} chosenSuit - Chosen suit
 * @returns {boolean} Whether the move is valid
 */
const isValidMove = (card, lastPlayedCard, chosenSuit) => {
  if (!lastPlayedCard) return true; // First card is always valid

  // Check chosen suit match
  if (chosenSuit) {
    if (card.suit === chosenSuit) return true;
    if (
      card.suit === 'red' &&
      (chosenSuit === 'hearts' || chosenSuit === 'diamonds')
    )
      return true;
    if (
      card.suit === 'black' &&
      (chosenSuit === 'spades' || chosenSuit === 'clubs')
    )
      return true;
  }

  // Joker is always valid
  if (card.value === 15) return true;

  // Special joker (spades) always valid for penalty
  if (card.value === 15 && card.suit === 'spades') return true;

  // Check color match
  if (
    card.suit === 'red' &&
    (lastPlayedCard.suit === 'hearts' || lastPlayedCard.suit === 'diamonds')
  )
    return true;
  if (
    card.suit === 'black' &&
    (lastPlayedCard.suit === 'spades' || lastPlayedCard.suit === 'clubs')
  )
    return true;

  // Check suit or value match
  if (card.suit === lastPlayedCard.suit || card.value === lastPlayedCard.value)
    return true;

  return false;
};

/**
 * Handle incoming WebSocket messages related to bot games
 * @param {Object} ws - WebSocket connection
 * @param {Object} data - Message data
 * @param {Map} clients - WebSocket clients map
 */
export const handleBotMessage = async (ws, data, clients) => {
  if (!data.data || !data.data.to) return;
  const { GameState } = await import('../models/GameState.js');

  const { to, from } = data.data;

  // Check if this is a message to a bot
  const isBotGame = to.startsWith('bot_');
  if (!isBotGame) return;

  // Get game state for this player-bot pair
  const gameState = await GameState.findOne({
    isBot: true,
    botId: to,
    uid: from,
  });

  if (!gameState) return;

  // Update game state based on player's move
  switch (data.type) {
    case 'MOVE':
      await handlePlayerMove(gameState, data.data);
      break;
    case 'DRAW':
      await handlePlayerDraw(gameState, data.data);
      break;
    case 'SKIP':
      gameState.currentTurn = to; // Set turn to bot
      await gameState.save();
      break;
    case 'WIN':
      gameState.winner = from;
      gameState.status = 'COMPLETED';
      await gameState.save();
      return; // Game over, no need for bot to respond
  }

  // Schedule bot's turn
  if (gameState.currentTurn === to) {
    setTimeout(() => handleBotTurn(gameState.gameId, clients), BOT_DELAY_MS);
  }
};

/**
 * Handle player's move in a bot game
 * @param {Object} gameState - Game state
 * @param {Object} moveData - Move data
 */
const handlePlayerMove = async (gameState, moveData) => {
  const { card, selectedSuit, penaltyActive } = moveData;

  // Update player's hand
  const playerHand = gameState.players.get(gameState.uid);
  const cardIndex = playerHand.findIndex((c) => c.id === card.id);

  if (cardIndex !== -1) {
    playerHand.splice(cardIndex, 1);
    gameState.playedCards.push({ ...card, type: 'played' });
    gameState.currentCard = card;

    if (selectedSuit) {
      gameState.chosenSuit = selectedSuit;
    }

    // Check for win condition
    if (playerHand.length === 0) {
      gameState.winner = gameState.uid;
      gameState.status = 'COMPLETED';
      await gameState.save();
      return;
    }

    // Update turn if not a turn-holding card
    if (![8, 11].includes(card.value)) {
      gameState.currentTurn = gameState.botId;
    }
  }

  await gameState.save();
};

/**
 * Handle player's draw in a bot game
 * @param {Object} gameState - Game state
 * @param {Object} drawData - Draw data
 */
const handlePlayerDraw = async (gameState, drawData) => {
  const { count } = drawData;
  const playerHand = gameState.players.get(gameState.uid);

  // Add cards to player's hand
  for (let i = 0; i < count; i++) {
    if (gameState.deck.length === 0) {
      // Reshuffle if needed
      if (gameState.playedCards.length > 1) {
        gameState.deck = gameState.playedCards
          .slice(0, -1)
          .map((c) => ({ ...c, type: 'pile' }));
        gameState.playedCards = [
          gameState.playedCards[gameState.playedCards.length - 1],
        ];
      } else {
        break; // No more cards
      }
    }

    const card = gameState.deck.pop();
    if (card) {
      playerHand.push({ ...card, type: 'player' });
    }
  }

  // Update turn to bot
  gameState.currentTurn = gameState.botId;
  await gameState.save();
};

/**
 * Request a game with a bot
 * @param {string} uid - Player ID
 * @param {Map} clients - WebSocket clients map
 */
export const requestBotGame = async (uid, clients) => {
  const playerWs = clients.get(uid);
  if (!playerWs) return;

  const botPlayer = createBotPlayer();
  const gameState = await startBotGame({ id: uid }, botPlayer, clients);

  return gameState;
};
