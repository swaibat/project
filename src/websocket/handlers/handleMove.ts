import { WebSocket } from 'ws';
import { WebSocketMessageType } from '../../types/messageTypes';
import { CardType, GameState, WsProps } from '../types';
import { endGame } from './endGame';
import { clients, gameStates, PLAY_TIMEOUT_DURATION } from '../state';
import { startTimeout } from '../wsUtil';



// Implementation
export const handleMove = async ({
  ws,
  data
}: WsProps): Promise<void> => {
  const { gameId, from, to, cards, newSuit } = data;
  const gameState = gameStates.get(gameId);

  // Basic game state validations
  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  if (!gameState.players[from]) {
    ws.send(
      JSON.stringify({ type: 'ERROR', message: 'Player not found in game' }),
    );
    return;
  }

  if (gameState.currentTurn !== from) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
    return;
  }

  let cuttingCardPlayed = false;

  // Validate and process all actions
  for (const action of cards) {
    if (action.type === 'DRAW') {
      // Validate deck has enough cards
      const drawCount = action.count || 1;
      if (gameState.deck.length < drawCount) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: `Cannot draw ${drawCount} cards (only ${gameState.deck.length} left)`,
          }),
        );
        return;
      }

      const drawnCards = gameState.deck.splice(-drawCount);
      gameState.players[from].push(...drawnCards);
    } else {
      // Validate player has the card they're trying to play
      const cardExists = gameState.players[from].some(
        (c) => c.v === action.v && c.s === action.s,
      );

      if (!cardExists) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: `Card ${action.s}-${action.v} not found in player's hand`,
          }),
        );
        return;
      }

      // Check for cutting card
      if (action.v === 7 && action.s === gameState.cuttingCard.s) {
        cuttingCardPlayed = true;
      }

      // Update game state
      if (newSuit) {
        gameState.chosenSuit = newSuit;
      }

      gameState.players[from] = gameState.players[from].filter(
        (c) => c.v !== action.v || c.s !== action.s,
      );
      gameState.playedCards.push(action as CardType);
      gameState.currentCard =  action as CardType;
    }
  }

  // Game over conditions
  if (gameState.players[from].length === 0) {
    const opponent = Object.keys(gameState.players).find((id) => id !== from);
    endGame({
      gameId,
      winner: from,
      loser: opponent,
      reason: 'NO_CARDS',
      additionalData: { from, to, cards, newSuit },
    });
    return;
  }

  if (cuttingCardPlayed) {
    const allPlayers = Object.keys(gameState.players);
    const playerCardSums = allPlayers.map((id) => ({
      id,
      totalValue: gameState.players[id].reduce(
        (sum, card) => sum + Number(card.v),
        0,
      ),
    }));

    playerCardSums.sort((a, b) => a.totalValue - b.totalValue);
    endGame({
      gameId,
      winner: playerCardSums[0].id,
      loser: playerCardSums[1].id,
      reason: 'CUTTING_CARD',
      additionalData: { from, to, cards, newSuit },
    });
    return;
  }

  // Continue game
  gameState.currentTurn = to;
  startTimeout(gameId);

  const turnExpiresAt = Date.now() + PLAY_TIMEOUT_DURATION;
  gameState.turnExpiresAt = turnExpiresAt;
  gameStates.set(gameId, gameState);

  const { moveTimeout, ...newGameState } = gameState;

  console.log('====newGameState==', newGameState);
  // Notify all players
  Object.keys(gameState.players).forEach((playerId) => {
    const player = clients.get(playerId);
    player?.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.MOVE,
        data: {
          from,
          to,
          cards,
          newSuit,
          gameState: newGameState,
        },
      }),
    );
  });
};
