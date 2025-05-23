// WebSocketHandler.js
import { GameState } from '../models/GameState.js';
import { WebSocketMessageType } from '../types/messageTypes.js';
import { initializeDeck } from '../utils/cardUtils.js';
import { generateId } from './wsUtil.js';

// In-memory stores
const clients = new Map(); // uid -> WebSocket
const pendingRequests = new Map(); // requestId -> requestData
const gameStates = new Map(); // gameId -> gameState
const playerGameMap = new Map(); // uid -> gameId

export const handleWebSocketConnection = (ws) => {
  console.log('New client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case WebSocketMessageType.IDENTIFY:
          await handleIdentify(ws, data);
          break;
        case WebSocketMessageType.UPDATE_STAKE:
          await handleUpdateStake(ws, data);
          break;
        case WebSocketMessageType.START:
          await handleGameStart(ws, data);
          break;
        case WebSocketMessageType.MOVE:
          await handleMove(ws, data);
          break;
        case WebSocketMessageType.DRAW:
          await handleDraw(ws, data);
          break;
        case WebSocketMessageType.WIN:
          await handleWin(ws, data);
          break;
        case WebSocketMessageType.PING:
          console.log('=PING=');
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
        case WebSocketMessageType.GAME_REQUEST:
          await handleGameRequest(ws, data);
          break;
        case WebSocketMessageType.GAME_REQUEST_ACCEPTED:
          await handleGameRequestAccepted(ws, data);
          break;
        case WebSocketMessageType.GAME_REQUEST_DECLINED:
          await handleGameRequestDeclined(ws, data);
          break;
        case WebSocketMessageType.ONLINE_USERS:
          await handleOnlineUsersRequest(ws);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
          ws.send(
            JSON.stringify({ type: 'ERROR', message: 'Unknown message type' }),
          );
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ type: 'ERROR', message: error.message }));
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
};

const handleIdentify = async (ws, { data }) => {
  const { uid, username, balance, stake, avatar } = data;

  // Check if player is already in a game
  if (playerGameMap.has(uid)) {
    const gameId = playerGameMap.get(uid);
    const gameState = gameStates.get(gameId);

    if (gameState) {
      ws.send(
        JSON.stringify({
          type: WebSocketMessageType.IDENTIFY,
          gameState,
        }),
      );

      clients.set(uid, { ws, username, balance, stake, avatar });
      ws.uid = uid;
      console.log(`Player ${uid} reconnected to existing game ${gameId}`);
      await broadcastOnlineUsers();
      return;
    } else {
      // Clean up orphaned mapping
      playerGameMap.delete(uid);
    }
  }

  // New player with no existing games
  clients.set(uid, { ws, username, balance, stake, avatar });
  ws.uid = uid;

  ws.send(
    JSON.stringify({
      type: WebSocketMessageType.IDENTIFY,
    }),
  );

  console.log(`Player ${uid} identified with no active games`);
  await broadcastOnlineUsers();
};

const handleUpdateStake = async (ws, { data }) => {
  const { uid, stake } = data;

  const client = clients.get(uid);
  if (client) {
    client.stake = stake;
    console.log(`Updated stake for user ${uid} to ${stake}`);
    await broadcastOnlineUsers(); // notify all clients
  } else {
    console.warn(`User ${uid} not found when trying to update stake.`);
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'User not connected',
      }),
    );
  }
};

const handleGameStart = async (ws, data) => {
  const { gameId } = data;
  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  gameState.status = 'PLAYING';
  gameStates.set(gameId, gameState);

  broadcastToGame(gameId, {
    type: WebSocketMessageType.START,
    gameState,
  });
};

const handleMove = async (ws, { data }) => {
  const { gameId, from, to, cards, newSuit } = data;

  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  const playerCards = gameState.players[from];

  if (!playerCards) {
    ws.send(
      JSON.stringify({ type: 'ERROR', message: 'Player not found in game' }),
    );
    return;
  }
  let gameOver = false;
  // Process all actions in exact order
  for (const action of cards.reverse()) {
    if (action.type === 'DRAW') {
      // Handle draw action
      const drawnCards = gameState.deck.splice(0, action.count || 1);
      gameState.players[from].push(...drawnCards);
    } else {
      // Validate and play card
      const cardIndex = playerCards.findIndex((c) => c.id === action.id);
      if (cardIndex === -1) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: `Card not in hand`,
          }),
        );
        return;
      }
      

      // if (action.value === 7 && action.suit === gameState.cuttingCard.suit) {
      //   gameOver = true;
      // }
      if (action.value === 7 || action.value === 13 || action.value === 12 ) {
        gameOver = true;
      }

      // Update game state
      if (newSuit) {
        gameState.chosenSuit = newSuit;
      }
      gameState.players[from] = playerCards.filter((c) => c.id !== action.id);
      gameState.playedCards.push(action);
      gameState.currentCard = newSuit
        ? { suit: newSuit, value: newSuit }
        : action;
    }
  }
  // Update turn to the specified 'to' player
  // gameState.currentTurn = to;
  gameStates.set(gameId, gameState);

  console.log('===WINNER HANDLER===',{ from, to, cards, newSuit, gameOver });

  // Notify opponent
  const toPlayer = clients.get(to);
  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.MOVE,
        data: { from, to, cards, newSuit, gameOver },
      }),
    );
  }
};

const handleDraw = async (ws, { data }) => {
  const { gameId, from, to, count } = data;

  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  // Validate draw count (allow only 1, 2, 3, or 5)
  const drawCount = [1, 2, 3, 5].includes(count) ? count : 1;

  // Check if there are enough cards in the deck
  if (gameState.deck.length < drawCount) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'Not enough cards left in deck',
      }),
    );
    return;
  }

  // Optimized draw: remove last N cards from deck
  const drawnCards = gameState.deck.splice(-drawCount);

  gameState.players[from].push(...drawnCards);

  // Save updated state
  gameStates.set(gameId, gameState);

  // Notify the drawing player
  const toPlayer = clients.get(to);
  const response = {
    type: WebSocketMessageType.DRAW,
    gameState,
    data: {
      to,
      count,
    },
  };

  if (toPlayer) toPlayer.ws.send(JSON.stringify(response));
};

const handleWin = async (ws, data) => {
  const { gameId, to, from, winner } = data;
  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  gameState.winner = winner;
  gameStates.set(gameId, gameState);

  // Clean up player-game mappings
  for (const player of gameState.players.keys()) {
    playerGameMap.delete(player);
  }

  const toPlayer = clients.get(to);
  const response = {
    type: WebSocketMessageType.WIN,
    data: {
      to,
      winner,
    },
  };
  console.log('===WINNER HANDLER===',{
    to,
    winner,
  });

  if (toPlayer) toPlayer.ws.send(JSON.stringify(response));
};

const handleGameRequest = async (ws, data) => {
  const { user, opponent, stake } = data.data;
  // Check if either player is already in a game
  if (playerGameMap.has(user.uid) || playerGameMap.has(opponent.uid)) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players are already in a game',
      }),
    );
    return;
  }

  const toPlayer = clients.get(opponent.uid);
  const requestId = generateId();
  const expiryTimeout = setTimeout(() => {
    pendingRequests.delete(requestId);
  }, 10000);

  pendingRequests.set(requestId, {
    user,
    opponent,
    stake,
    timestamp: Date.now(),
    timeout: expiryTimeout,
  });

  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST,
        requestId,
        user,
        opponent,
        stake,
        expiresAt: Date.now() + 10000,
      }),
    );
  }
  console.log(`Game request sent (ID: ${requestId})`);
};

const handleGameRequestAccepted = async (ws, { data }) => {
  const { requestId } = data;
  const request = pendingRequests.get(requestId);

  if (!request) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'Request expired or invalid',
      }),
    );
    return;
  }

  clearTimeout(request.timeout);
  pendingRequests.delete(requestId);

  const { user, opponent } = request;

  // Double check players aren't in other games (race condition)
  if (playerGameMap.has(user.uid) || playerGameMap.has(opponent.uid)) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players are already in a game',
      }),
    );
    return;
  }

  const fromPlayer = clients.get(user.uid);
  const toPlayer = clients.get(opponent.uid);

  if (!fromPlayer || !toPlayer) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players disconnected',
      }),
    );
    return;
  }

  const { deck, playerHands, cuttingCard } = initializeDeck([
    user.uid,
    opponent.uid,
  ]);
  const gameId = generateId();
  const gameState = {
    gameId,
    players: playerHands,
    status: 'ACTIVE',
    userId: user.uid,
    currentTurn: user.uid,
    cuttingCard,
    deck,
    playedCards: [],
    currentCard: null,
    chosenSuit: null,
    createdAt: new Date(),
  };

  // Update player-game mappings
  playerGameMap.set(user.uid, gameId);
  playerGameMap.set(opponent.uid, gameId);
  gameStates.set(gameId, gameState);

  const response = {
    type: WebSocketMessageType.GAME_REQUEST_ACCEPTED,
    gameId,
    gameState,
  };

  fromPlayer.ws.send(JSON.stringify(response));
  toPlayer.ws.send(JSON.stringify(response));
};

const handleGameRequestDeclined = async (ws, data) => {
  const { requestId } = data.data;

  const request = pendingRequests.get(requestId);
  if (!request) return;

  clearTimeout(request.timeout);
  pendingRequests.delete(requestId);

  const sender = clients.get(request.from);
  if (sender) {
    sender.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST_DECLINED,
        to: request.to,
        from: request.from,
      }),
    );
  }
};

const handleOnlineUsersRequest = async (ws) => {
  const onlineUsers = Array.from(clients.entries())
    .filter(([uid, user]) => uid) // Only keep entries with uid defined
    .map(([uid, { username, balance, avatar, stake }]) => ({
      uid,
      username,
      balance,
      avatar,
      stake,
    }));

  ws.send(
    JSON.stringify({
      type: WebSocketMessageType.ONLINE_USERS,
      users: onlineUsers,
    }),
  );
};

const handleDisconnect = async (ws) => {
  if (ws.uid) {
    clients.delete(ws.uid);
    console.log(`Player ${ws.uid} disconnected`);
    await broadcastOnlineUsers();
    // Note: We don't remove from playerGameMap here to allow reconnection
  }
};

const broadcastOnlineUsers = async () => {
  const onlineUsers = Array.from(clients.entries()).map(
    ([uid, { username, avatar, balance, stake }]) => ({
      uid,
      username,
      avatar,
      balance,
      stake,
    }),
  );

  const message = JSON.stringify({
    type: WebSocketMessageType.ONLINE_USERS,
    users: onlineUsers,
  });

  for (const [, { ws }] of clients) {
    ws.send(message);
  }
};

const broadcastToGame = (gameId, message) => {
  const gameState = gameStates.get(gameId);
  if (!gameState) return;

  for (const uid of gameState.players.keys()) {
    const client = clients.get(uid);
    if (client) {
      client.ws.send(JSON.stringify(message));
    }
  }
};

export {
  handleIdentify,
  handleGameStart,
  handleMove,
  handleDraw,
  handleWin,
  handleGameRequest,
  handleGameRequestAccepted,
  handleGameRequestDeclined,
  handleDisconnect,
  handleOnlineUsersRequest,
  broadcastOnlineUsers,
  broadcastToGame,
};
