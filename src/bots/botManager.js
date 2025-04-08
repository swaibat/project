// botPlayer.js
import WebSocket from 'ws';
// import { WebSocketMessageType } from './constants.js';
// import { GameState } from './models/GameState.js';

const PENALTY_CARD_VALUES = [2, 3, 50];

export const createBotPlayer = (gameId, playerId = `BOT_${Date.now()}`) => {
  const ws = new WebSocket('ws://192.168.1.48:3000'); // Adjust URL as needed

  const sendMessage = (message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const initializeWebSocket = () => {
    ws.on('open', () => {
      sendMessage({
        type: WebSocketMessageType.IDENTIFY,
        data: { playerId },
      });
    });

    ws.on('message', (message) => {
      const data = JSON.parse(message);
      handleServerMessage(data);
    });

    ws.on('error', (error) => {
      console.error('Bot WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('Bot WebSocket connection closed');
    });
  };

  const handleServerMessage = async (data) => {
    switch (data.type) {
      case WebSocketMessageType.START:
      case WebSocketMessageType.MOVE:
      case WebSocketMessageType.DRAW:
      case WebSocketMessageType.SKIP:
        await processGameState(data.gameState);
        break;
      case WebSocketMessageType.WIN:
        console.log(`Game ${gameId} ended. Winner: ${data.gameState.winner}`);
        ws.close();
        break;
    }
  };

  const isValidMove = (card, lastPlayedCard, chosenSuit, penaltyActive) => {
    if (!lastPlayedCard) return true;

    if (chosenSuit) {
      if (chosenSuit === card.suit) return true;
      if (chosenSuit === 'red' && ['hearts', 'diamonds'].includes(card.suit)) return true;
      if (chosenSuit === 'black' && ['spades', 'clubs'].includes(card.suit)) return true;
    }

    if (card.value === 15 && card.suit === 'spades') return true;

    if (lastPlayedCard.suit === 'red' && ['hearts', 'diamonds'].includes(card.suit)) return true;
    if (lastPlayedCard.suit === 'black' && ['spades', 'clubs'].includes(card.suit)) return true;

    if (penaltyActive) {
      if (!PENALTY_CARD_VALUES.includes(card.value)) return false;
      if (lastPlayedCard.suit === 'red' && ['hearts', 'diamonds'].includes(card.suit)) return true;
      if (lastPlayedCard.suit === 'black' && ['spades', 'clubs'].includes(card.suit)) return true;
      if (card.suit === lastPlayedCard.suit || card.value === lastPlayedCard.value) return true;
      return false;
    }

    if (card.value === 15) return true;
    if (lastPlayedCard.suit === 'red' && ['hearts', 'diamonds'].includes(card.suit)) return true;
    if (lastPlayedCard.suit === 'black' && ['spades', 'clubs'].includes(card.suit)) return true;
    if (card.suit === lastPlayedCard.suit || card.value === lastPlayedCard.value) return true;

    return false;
  };

  const processGameState = async (gameState) => {
    if (gameState.currentTurn !== playerId) return;

    const playerHand = gameState.players.get(playerId);
    const lastPlayedCard = gameState.currentCard;
    const pileCards = gameState.deck;
    const cuttingCard = gameState.cuttingCard;
    const penaltyActive = PENALTY_CARD_VALUES.includes(lastPlayedCard?.value);
    const chosenSuit = gameState.chosenSuit;

    const playableCards = playerHand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => isValidMove(card, lastPlayedCard, chosenSuit, penaltyActive));

    if (penaltyActive) {
      if (playableCards.length > 0) {
        const penaltyCards = playableCards.filter(({ card }) =>
          PENALTY_CARD_VALUES.includes(card.value)
        );

        if (penaltyCards.length > 0) {
          const cardToPlay =
            penaltyCards.find(({ card }) =>
              card.value >= (lastPlayedCard.value === 50 ? 5 : lastPlayedCard.value)
            ) || penaltyCards[0];
          playCard(cardToPlay);
        } else {
          playCard(playableCards[0]);
        }
      } else {
        const penaltyCount = lastPlayedCard.value === 50 ? 5 : lastPlayedCard.value;
        drawCard(penaltyCount);
      }
    } else if (chosenSuit && playableCards.length === 0) {
      drawCard(1);
    } else if (playableCards.length > 0) {
      const specialCards = playableCards.filter(({ card }) =>
        [15, 11].includes(card.value) || (card.value === 7 && card.suit === cuttingCard.suit)
      );

      const cardToPlay = specialCards.length > 0
        ? specialCards[Math.floor(Math.random() * specialCards.length)]
        : playableCards[Math.floor(Math.random() * playableCards.length)];

      playCard(cardToPlay);
    } else if (pileCards.length > 0) {
      drawCard(1);
    } else {
      skipTurn();
    }
  };

  const playCard = ({ card, index }) => {
    const message = {
      type: WebSocketMessageType.MOVE,
      gameId,
      playerId,
      card,
    };

    if (card.value === 15) {
      const suits = ['hearts', 'diamonds', 'spades', 'clubs', 'red', 'black'];
      message.chosenSuit = card.suit === 'spades' && lastPlayedCard
        ? null
        : suits[Math.floor(Math.random() * suits.length)];
    }

    sendMessage(message);

    setTimeout(async () => {
      const game = await GameState.findOne({ gameId });
      if (game.players.get(playerId).length === 0) {
        sendMessage({
          type: WebSocketMessageType.WIN,
          gameId,
          playerId,
        });
      }
    }, 100);
  };

  const drawCard = (count = 1) => {
    for (let i = 0; i < count; i++) {
      sendMessage({
        type: WebSocketMessageType.DRAW,
        gameId,
        playerId,
      });
    }
  };

  const skipTurn = () => {
    sendMessage({
      type: WebSocketMessageType.SKIP,
      gameId,
      playerId,
    });
  };

  initializeWebSocket();
  return { ws, playerId };
};

export const startBotGame = async (humanPlayerId, gameId) => {
  const bot = createBotPlayer(gameId);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const botWs = global.clients.get(bot.playerId);
  if (botWs) {
    botWs.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST,
        data: {
          from: humanPlayerId,
          to: bot.playerId,
          username: 'BotPlayer',
        },
      })
    );
  }
};