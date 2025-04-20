// WebSocketHandler.js
import { WebSocketMessageType } from '../types/messageTypes.js';
import { initializeDeck } from '../utils/cardUtils.js';
import { generateId, notifyExpiry } from './wsUtil.js';
import { createBotPlayer, startBotGame } from '../bots/botManager.js';

// In-memory stores
const clients = new Map(); // playerId -> WebSocket
const pendingRequests = new Map(); // requestId -> requestData
const gameStates = new Map(); // gameId -> gameState
const playerGameMap = new Map(); // playerId -> gameId

export const handleWebSocketConnection = (ws) => {
  console.log('New client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case WebSocketMessageType.IDENTIFY:
          await handleIdentify(ws, data);
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
        case WebSocketMessageType.SKIP:
          await handleSkip(ws, data);
          break;
        case WebSocketMessageType.WIN:
          await handleWin(ws, data);
          break;
        case WebSocketMessageType.PING:
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
  const { playerId, username } = data;

  console.log('====================================');
  console.log(data);
  console.log('====================================');

  // Check if player is already in a game
  if (playerGameMap.has(playerId)) {
    const gameId = playerGameMap.get(playerId);
    const gameState = gameStates.get(gameId);

    if (gameState) {
      ws.send(
        JSON.stringify({
          type: WebSocketMessageType.IDENTIFY,
          gameState,
        }),
      );

      clients.set(playerId, { ws, username });
      ws.playerId = playerId;
      console.log(`Player ${playerId} reconnected to existing game ${gameId}`);
      await broadcastOnlineUsers();
      return;
    } else {
      // Clean up orphaned mapping
      playerGameMap.delete(playerId);
    }
  }

  // New player with no existing games
  clients.set(playerId, { ws, username });
  ws.playerId = playerId;

  ws.send(
    JSON.stringify({
      type: WebSocketMessageType.IDENTIFY,
    }),
  );

  console.log(`Player ${playerId} identified with no active games`);
  await broadcastOnlineUsers();
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
  const { to, from } = data;
  const toPlayer = clients.get(to);

  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.MOVE,
        data,
      }),
    );
  }
};

const handleDraw = async (ws, { data }) => {
  const { to } = data;
  const toPlayer = clients.get(to);

  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.DRAW,
        data,
      }),
    );
  }
};

const handleSkip = async (ws, { data }) => {
  const { to, from } = data;
  const toPlayer = clients.get(to);

  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.SKIP,
        data,
      }),
    );
  }
};

const handleWin = async (ws, data) => {
  const { gameId, playerId } = data;
  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  gameState.winner = playerId;
  gameState.status = 'COMPLETED';
  gameStates.set(gameId, gameState);

  // Clean up player-game mappings
  for (const player of gameState.players.keys()) {
    playerGameMap.delete(player);
  }

  broadcastToGame(gameId, {
    type: WebSocketMessageType.WIN,
    gameState,
  });
};

const handleGameRequest = async (ws, data) => {
  const { from, to, username } = data.data;

  // Check if either player is already in a game
  if (playerGameMap.has(from) || playerGameMap.has(to)) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players are already in a game',
      }),
    );
    return;
  }

  const toPlayer = clients.get(to);
  const requestId = generateId();
  const expiryTimeout = setTimeout(() => {
    pendingRequests.delete(requestId);
  }, 10000);

  pendingRequests.set(requestId, {
    from,
    to,
    username,
    timestamp: Date.now(),
    timeout: expiryTimeout,
  });

  if (toPlayer) {
    toPlayer.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST,
        requestId,
        username,
        from,
        to,
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

  const { from, to } = request;

  // Double check players aren't in other games (race condition)
  if (playerGameMap.has(from) || playerGameMap.has(to)) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players are already in a game',
      }),
    );
    return;
  }

  const fromPlayer = clients.get(from);
  const toPlayer = clients.get(to);

  if (!fromPlayer || !toPlayer) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players disconnected',
      }),
    );
    return;
  }

  const { deck, playerHands, cuttingCard } = initializeDeck([from, to]);
  const gameId = generateId();
  const gameState = {
    gameId,
    players: playerHands,
    status: 'ACTIVE',
    userId: from,
    currentTurn: from,
    cuttingCard,
    deck,
    playedCards: [],
    currentCard: null,
    chosenSuit: null,
    createdAt: new Date(),
  };

  // Update player-game mappings
  playerGameMap.set(from, gameId);
  playerGameMap.set(to, gameId);
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
  const onlineUsers = Array.from(clients.entries()).map(([playerId, { username }]) => ({
    playerId,
    username,
  }));

  console.log('onlineUsers', onlineUsers);
  

  ws.send(
    JSON.stringify({
      type: WebSocketMessageType.ONLINE_USERS,
      users: onlineUsers,
    }),
  );
};

const handleDisconnect = async (ws) => {
  if (ws.playerId) {
    clients.delete(ws.playerId);
    console.log(`Player ${ws.playerId} disconnected`);
    await broadcastOnlineUsers();
    // Note: We don't remove from playerGameMap here to allow reconnection
  }
};

const broadcastOnlineUsers = async () => {
  const onlineUsers = Array.from(clients.entries()).map(([playerId, { username }]) => ({
    playerId,
    username,
  }));

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

  for (const playerId of gameState.players.keys()) {
    const client = clients.get(playerId);
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
  handleSkip,
  handleWin,
  handleGameRequest,
  handleGameRequestAccepted,
  handleGameRequestDeclined,
  handleDisconnect,
  handleOnlineUsersRequest,
  broadcastOnlineUsers,
  broadcastToGame,
};
