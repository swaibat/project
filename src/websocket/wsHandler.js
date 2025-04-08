// WebSocketHandler.js
import { WebSocketMessageType } from '../types/messageTypes.js';
import { GameState } from '../models/GameState.js';
import { initializeDeck } from '../utils/cardUtils.js';
import { generateId, notifyExpiry } from './wsUtil.js';
import { createBotPlayer, startBotGame } from '../bots/botManager.js';
// import { createBotPlayer, startBotGame } from './botPlayer';

const clients = new Map();
global.clients = clients;

const pendingRequests = new Map();

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
        default:
          console.warn(`Unknown message type: ${data.type}`);
          ws.send(
            JSON.stringify({ type: 'ERROR', message: 'Unknown message type' })
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

const handleIdentify = async (ws, data) => {
  const { playerId } = data.data;
  clients.set(playerId, ws);
  ws.playerId = playerId;

  broadcastOnlineUsers();

  await GameState.find({});

  const toPlayerWs = clients.get(playerId);

  toPlayerWs.send(
    JSON.stringify({
      type: WebSocketMessageType.IDENTIFY,
      expiresAt: Date.now() + 10000,
    })
  );

  console.log(data, `Player ${playerId} identified`);
};

const handleGameStart = async (ws, data) => {
  const { gameId } = data;
  const gameState = await GameState.findOne({ gameId });

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  await GameState.updateOne({ gameId }, { $set: { status: 'PLAYING' } });

  broadcastToGame(gameId, {
    type: WebSocketMessageType.START,
    gameState,
  });
};

const handleMove = async (ws, data) => {
  const { gameId, playerId, card, chosenSuit } = data;
  const gameState = await GameState.findOne({ gameId });

  if (!gameState || gameState.currentTurn !== playerId) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid move' }));
    return;
  }

  const playerHand = gameState.players.get(playerId);
  const cardIndex = playerHand.findIndex((c) => c.id === card.id);

  if (cardIndex === -1) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Card not in hand' }));
    return;
  }

  playerHand.splice(cardIndex, 1);
  gameState.playedCards.push({ ...card, type: 'played' });
  gameState.currentCard = card;

  if (chosenSuit) {
    gameState.chosenSuit = chosenSuit;
  }

  const playerIds = Array.from(gameState.players.keys());
  const currentPlayerIndex = playerIds.indexOf(playerId);
  const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
  gameState.currentTurn = playerIds[nextPlayerIndex];

  await gameState.save();
  broadcastToGame(gameId, {
    type: WebSocketMessageType.MOVE,
    gameState,
  });
};

const handleDraw = async (ws, data) => {
  const { gameId, playerId } = data;
  const gameState = await GameState.findOne({ gameId });

  if (!gameState || gameState.currentTurn !== playerId) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid draw' }));
    return;
  }

  const card = gameState.deck.pop();
  if (!card) {
    gameState.deck = gameState.playedCards
      .slice(0, -1)
      .map((c) => ({ ...c, type: 'pile' }));
    gameState.playedCards = [
      gameState.playedCards[gameState.playedCards.length - 1],
    ];
  }

  const playerHand = gameState.players.get(playerId);
  playerHand.push({ ...card, type: 'player' });

  await gameState.save();
  broadcastToGame(gameId, {
    type: WebSocketMessageType.DRAW,
    gameState,
  });
};

const handleSkip = async (ws, data) => {
  const { gameId, playerId } = data;
  const gameState = await GameState.findOne({ gameId });

  if (!gameState || gameState.currentTurn !== playerId) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid skip' }));
    return;
  }

  const playerIds = Array.from(gameState.players.keys());
  const currentPlayerIndex = playerIds.indexOf(playerId);
  const nextPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
  gameState.currentTurn = playerIds[nextPlayerIndex];

  await gameState.save();
  broadcastToGame(gameId, {
    type: WebSocketMessageType.SKIP,
    gameState,
  });
};

const handleWin = async (ws, data) => {
  const { gameId, playerId } = data;
  const gameState = await GameState.findOne({ gameId });

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }

  gameState.winner = playerId;
  gameState.status = 'COMPLETED';
  await gameState.save();

  broadcastToGame(gameId, {
    type: WebSocketMessageType.WIN,
    gameState,
  });
};

const handleGameRequest = async (ws, data) => {
  const { from, to, username } = data.data;
  console.log(data);

  if (to === 'BOT') {
    const gameId = generateId();
    const bot = createBotPlayer(gameId);
    await startBotGame(from, gameId);

    const { deck, playerHands, cuttingCard } = initializeDeck([from, bot.playerId]);
    const gameState = new GameState({
      players: playerHands,
      status: 'ACTIVE',
      userId: from,
      currentTurn: from,
      cuttingCard,
      deck,
      playedCards: [],
      currentCard: null,
      chosenSuit: null,
    });

    await gameState.save();

    const fromPlayerWs = clients.get(from);
    if (fromPlayerWs) {
      fromPlayerWs.send(
        JSON.stringify({
          type: WebSocketMessageType.GAME_REQUEST_ACCEPTED,
          gameId: gameState.gameId,
          gameState,
        })
      );
    }

    const botWs = clients.get(bot.playerId);
    if (botWs) {
      botWs.send(
        JSON.stringify({
          type: WebSocketMessageType.GAME_REQUEST_ACCEPTED,
          gameId: gameState.gameId,
          gameState,
        })
      );
    }

    console.log(`Bot game started (ID: ${gameId})`);
    return;
  }

  const toPlayerWs = clients.get(to);
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

  if (toPlayerWs) {
    toPlayerWs.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST,
        requestId,
        username,
        from,
        to,
        expiresAt: Date.now() + 10000,
      })
    );
  }

  console.log(`Game request sent (ID: ${requestId})`);
};

const handleGameRequestAccepted = async (ws, data) => {
  const { requestId } = data;
  const request = pendingRequests.get(requestId);

  if (!request) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'Request expired or invalid',
      })
    );
    return;
  }

  clearTimeout(request.timeout);
  pendingRequests.delete(requestId);

  const { from, to } = request;

  const fromPlayerWs = clients.get(from);
  const toPlayerWs = clients.get(to);

  if (!fromPlayerWs || !toPlayerWs) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'One or both players disconnected',
      })
    );
    return;
  }

  const { deck, playerHands, cuttingCard } = initializeDeck([from, to]);
  const gameState = new GameState({
    players: playerHands,
    status: 'ACTIVE',
    userId: from,
    currentTurn: from,
    cuttingCard,
    deck,
    playedCards: [],
    currentCard: null,
    chosenSuit: null,
  });

  await gameState.save();

  const response = {
    type: WebSocketMessageType.GAME_REQUEST_ACCEPTED,
    gameId: gameState.gameId,
    gameState,
  };
  fromPlayerWs.send(JSON.stringify(response));
  toPlayerWs.send(JSON.stringify(response));
};

const handleGameRequestDeclined = async (ws, data) => {
  const { requestId } = data.data;

  const request = pendingRequests.get(requestId);
  if (!request) return;

  clearTimeout(request.timeout);
  pendingRequests.delete(requestId);

  const senderWs = clients.get(request.from);
  if (senderWs) {
    senderWs.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST_DECLINED,
        to: request.to,
        from: request.from,
      })
    );
  }
};

const handleDisconnect = async (ws) => {
  if (ws.playerId) {
    clients.delete(ws.playerId);
    broadcastOnlineUsers();
    console.log(`Player ${ws.playerId} disconnected`);
  }
};

const broadcastOnlineUsers = async () => {
  // const onlineUsers = await User.find({ isOnline: true }).select('username _id');
  // const message = JSON.stringify({
  //   type: 'ONLINE_USERS',
  //   users: onlineUsers,
  // });
  // for (const client of clients.values()) {
  //   client.send(message);
  // }
};

const broadcastToGame = (gameId, message) => {
  GameState.findOne({ gameId }).then((gameState) => {
    if (!gameState) return;

    for (const playerId of gameState.players.keys()) {
      const clientWs = clients.get(playerId);
      if (clientWs) {
        clientWs.send(JSON.stringify(message));
      }
    }
  });
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
  broadcastOnlineUsers,
  broadcastToGame,
};