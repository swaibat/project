// WebSocketHandler.js
import { GameState } from '../models/GameState.js';
import { WebSocketMessageType } from '../types/messageTypes.js';
import { initializeDeck } from '../utils/cardUtils.js';
import { generateId } from './wsUtil.js';
import { initialGameState } from './initialState.js';
import WeeklyRanking from '../models/WeeklyRanking.js';
import User from '../models/User.js';
import { DateTime } from 'luxon';

// In-memory stores
const clients = new Map(); // uid -> WebSocket
const pendingRequests = new Map(); // requestId -> requestData
const gameStates = new Map(); // gameId -> gameState
const playerGameMap = new Map(); // uid -> gameId
const TURN_DURATION_MS = 30 * 1000;

const TIMEOUT_DURATION = 30000; // 30 seconds

function endGame(gameId, winner, loser, reason, additionalData = {}) {
  const gameState = gameStates.get(gameId);
  console.log('GAME_OVER 0000');
  if (!gameState) return;
  
  // Clear any existing timeout
  if (gameState.timeout) {
    clearTimeout(gameState.timeout);
    gameState.timeout = null;
  }
  
  // Prepare game over data
  const gameOverData = {
    winner,
    loser,
    reason,
    ...additionalData
  };
  
  // Notify all players
  const allPlayers = Object.keys(gameState.players);
  allPlayers.forEach(playerId => {
    const player = clients.get(playerId);
    if (player) {
      console.log('GAME_OVER 111111111');
      
      player.ws.send(
        JSON.stringify({
          type: WebSocketMessageType.GAME_OVER,
          data: gameOverData
        })
      );
    }
  });
  
  // Clean up the game after a brief delay
  setTimeout(() => {
    gameStates.delete(gameId);
  }, 5000);
}

function startTimeout(gameId) {
  const gameState = gameStates.get(gameId);
  if (!gameState) return;
  
  // Clear any existing timeout
  if (gameState.timeout) {
    clearTimeout(gameState.timeout);
  }
  
  gameState.timeout = setTimeout(() => {
    const inactivePlayer = gameState.currentTurn;
    const allPlayers = Object.keys(gameState.players);
    const opponent = allPlayers.find(playerId => playerId !== inactivePlayer);
    
    // End game due to timeout
    endGame(gameId, opponent, inactivePlayer, 'TIMEOUT');
  }, TIMEOUT_DURATION);
  
  // Update the game state with new timeout
  gameStates.set(gameId, gameState);
}


// Helper function to get the start of the current week
const getWeekStart = (date = DateTime.now().setZone('Africa/Nairobi')) => {
  const current = DateTime.fromJSDate(
    date instanceof Date ? date : new Date(date),
  ).setZone('Africa/Nairobi');
  const startOfWeek = current.startOf('week'); // Sunday 00:00
  const sundayNight = startOfWeek.set({
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
  return sundayNight.toJSDate();
};

// Helper function to update rankings
const updateRankings = async () => {
  const weekStart = getWeekStart();

  // Get all users sorted by points
  const users = await User.find().sort({ points: -1 }).exec();

  // Bulk update weekly rankings based on sorted users
  const bulkOps = users.map((user, index) => ({
    updateOne: {
      filter: { weekStart, userId: user._id },
      update: {
        $set: {
          weekStart,
          userId: user._id,
          username: user.username,
          position: index + 1,
        },
      },
      upsert: true,
    },
  }));

  // Perform all updates in a single bulkWrite operation
  if (bulkOps.length > 0) {
    await WeeklyRanking.bulkWrite(bulkOps);
  }

  // Prepare rankings for broadcast (points pulled from User model)
  const updatedRankings = users.map((user, index) => ({
    userId: user._id,
    username: user.username,
    points: user.points,
    position: index + 1,
  }));

  console.log('===updatedRankings===', updatedRankings);
};

// Helper function to reset weekly rankings
const resetWeeklyRankings = async () => {
  const weekStart = getWeekStart();
  const previousWeekStart = new Date(weekStart - 7 * 24 * 60 * 60 * 1000);

  // Archive current week rankings to history
  const rankings = await WeeklyRanking.find({
    weekStart: previousWeekStart,
  }).exec();
  for (const ranking of rankings) {
    ranking.history.push({
      weekStart: previousWeekStart,
      points: ranking.points,
      position: ranking.position,
    });
    ranking.points = 0;
    ranking.position = 0;
    await ranking.save();
  }

  // Create new week rankings for active users
  const users = await mongoose.model('User').find().exec();
  for (const user of users) {
    await WeeklyRanking.findOneAndUpdate(
      { weekStart, userId: user._id },
      {
        weekStart,
        userId: user._id,
        username: user.username,
        points: 0,
        position: 0,
      },
      { upsert: true, new: true },
    );
  }

  await updateRankings();
};

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
        case WebSocketMessageType.GAME_OVER:
          await handleGameOver(ws, data);
          break;
        case WebSocketMessageType.PING:
          console.log('=PING=');
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
        case WebSocketMessageType.GAME_REQUEST:
          await handleGameRequest(ws, data);
          // await handleNearbyPlayers(ws, data);
          break;
        case WebSocketMessageType.PLAYER_READY:
          console.log('===PLAYER_READY====', data);
          await handlePlayerReady(ws, data);
          break;
        case WebSocketMessageType.GAME_REQUEST_ACCEPTED:
          console.log('GAME_REQUEST_ACCEPTED', data);
          
          await handleGameRequestAccepted(ws, data);
          break;
        case WebSocketMessageType.GAME_REQUEST_DECLINED:
          await handleGameRequestDeclined(ws, data);
          break;
        case WebSocketMessageType.ONLINE_USERS:
          await handleOnlineUsersRequest(ws);
          break;
        // case WebSocketMessageType.NEARBY_PLAYERS:
        //   await handleNearbyPlayers(ws, data);
        //   break;
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

// Modified handleIdentify to initialize WeeklyRanking
const handleIdentify = async (ws, { data }) => {
  const { uid, username, balance, stake, avatar } = data;

  let rank;
  try {
    rank = await handleNearbyPlayers(uid);
  } catch (err) {
    console.error(`Failed to fetch rank for ${uid}:`, err);
    rank = null;
  }

  const playerData = { ws, username, balance, stake, avatar, rank };

  // Reconnection case
  if (playerGameMap.has(uid)) {
    const gameId = playerGameMap.get(uid);
    const gameState = gameStates.get(gameId);

    if (gameState) {
      sendToClient(ws, {
        type: WebSocketMessageType.IDENTIFY,
        gameState,
      });

      registerClient(uid, playerData);
      console.log(`Player ${uid} reconnected to existing game ${gameId}`);
      console.log('=====1=====', 1);
      return;
    }

    console.log('=====2=====', 2);

    // Cleanup stale mapping if game no longer exists
    playerGameMap.delete(uid);
  }

  console.log('=====3=====', 3);

  // New or resumed session — Initialize with initialGameState
  // const newGameId = initialGameState.gameId;
  // gameStates.set(newGameId, initialGameState);
  // playerGameMap.set(uid, newGameId);

  // registerClient(uid, playerData);

  // sendToClient(ws, {
  //   type: WebSocketMessageType.IDENTIFY,
  //   gameState: initialGameState,
  // });

  // sendIdentifyMessage(ws, playerData);

  // console.log(`Player ${uid} started or resumed new game ${newGameId}`);
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

const handlePlayerReady = async (ws, { data }) => {
  const { gameId, uid } = data;
  const turnExpiresAt = Date.now() + 30 * 1000;

  const gameState = gameStates.get(gameId);

  if (!gameState || !gameState.players[uid]) {
    ws.send(
      JSON.stringify({ type: 'ERROR', message: 'Invalid game or player' }),
    );
    return;
  }

  gameState.turnExpiresAt = turnExpiresAt;

  // Mark this player as ready
  gameState.ready.add(uid);
  // Check if both players are ready
  // const allReady = Object.values(gameState.ready).every((r) => r === true);
  const allReady = gameState.ready.size === 2;
  
  if (allReady) {
    (gameState.status = 'STARTED'), (gameState.turnExpiresAt = turnExpiresAt);
    // Notify both players the game is starting
    broadcastToGame(gameId, {
      type: WebSocketMessageType.START,
      data: {
        gameId,
        currentTurn: gameState.currentTurn,
        turnExpiresAt: turnExpiresAt,
      },
    });
  }
};

const registerClient = (uid, playerData) => {
  clients.set(uid, playerData);
  playerData.ws.uid = uid;
};

const sendToClient = (ws, message) => {
  ws.send(JSON.stringify(message));
};

const sendIdentifyMessage = (
  ws,
  { username, balance, stake, avatar, rank },
) => {
  sendToClient(ws, {
    type: WebSocketMessageType.IDENTIFY,
    data: { username, balance, stake, avatar, rank },
  });
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
  
  // Verify it's the player's turn
  if (gameState.currentTurn !== from) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
    return;
  }
  
  console.log('=======data=====', data);
  
  // Process all actions in exact order
  for (const action of cards) {
    if (action.type === 'DRAW') {
      const drawCount = Math.min(action.count || 1, gameState.deck.length);
      const drawnCards = gameState.deck.splice(-drawCount);
      gameState.players[from].push(...drawnCards);
    } else {
      // Update game state for played card
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
  
  // Check for game over conditions
  if (gameState.players[from].length === 0) {
    // Player won by running out of cards
    const opponent = Object.keys(gameState.players).find(id => id !== from);
    endGame(gameId, from, opponent, 'NO_CARDS', { finalMove: { from, to, cards, newSuit } });
    return;
  }
  
  // Check if cutting card was played
  let cuttingCardPlayed = false;
  for (const action of cards) {
    if (action.type !== 'DRAW' && action.value === 7 && action.suit === gameState.cuttingCard.suit) {
      cuttingCardPlayed = true;
      break;
    }
  }
  
  if (cuttingCardPlayed) {
    // Game ends when cutting card is played - determine winner based on total card values
    const allPlayers = Object.keys(gameState.players);
  
    const playerCardSums = allPlayers.map(id => {
      const hand = gameState.players[id];
      const totalValue = hand.reduce((sum, card) => sum + Number(card.value), 0);
      return { id, totalValue };
    });
  
    // Lower total value wins
    playerCardSums.sort((a, b) => a.totalValue - b.totalValue);
    const winner = playerCardSums[0].id;
    const loser = playerCardSums[1].id;
  
    endGame(gameId, winner, loser, 'CUTTING_CARD', {
      finalMove: { from, to, cards, newSuit }
    });
    return;
  }
  
  // Game continues - update turn and start timeout
  gameState.currentTurn = to;
  startTimeout(gameId);
  
  // Set turn expiration time for client reference
  const turnExpiresAt = Date.now() + TIMEOUT_DURATION;
  gameState.turnExpiresAt = turnExpiresAt;
  
  // Update game state
  gameStates.set(gameId, gameState);
  
  // Send regular MOVE event for ongoing game
  const allPlayers = Object.keys(gameState.players);
  allPlayers.forEach(playerId => {
    const player = clients.get(playerId);
    if (player) {
      player.ws.send(
        JSON.stringify({
          type: WebSocketMessageType.MOVE,
          data: { 
            from, 
            to, 
            cards, 
            newSuit, 
            turnExpiresAt,
            currentTurn: gameState.currentTurn
          },
        }),
      );
    }
  });
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

const handleGameOver = async (ws, data) => {
  const { gameId, to, from, winner, status } = data;
  //statuses, TIMEOUT,CUT,FINISHED,ABANDONED
  const gameState = gameStates.get(gameId);

  if (!gameState) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }
  gameState.gameOver = true;
  gameState.winner = winner;
  gameState.status;
  gameStates.set(gameId, gameState);

  // Clean up player-game mappings
  for (const player of Object.keys(gameState.players)) {
    playerGameMap.delete(player);
  }

  const toPlayer = clients.get(to);
  const response = {
    type: WebSocketMessageType.WIN,
    data: {
      to,
      from,
      gameOver: true,
      status,
      winner,
    },
  };
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

  if(opponent.balance < opponent.stake.amount + opponent.stake.charge){
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        message: 'opponent low balance',
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
    ready: new Set(),
    playedCards: [],
    currentCard: null,
    chosenSuit: null,
    createdAt: new Date(),
    stake:opponent.stake,
    // 👇 Added meta data
    meta: {
      [user.uid]: {
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
      },
      [opponent.uid]: {
        username: opponent.username,
        avatar: opponent.avatar,
        balance: opponent.balance,
      },
    },
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

// New handler for nearby players
const handleNearbyPlayers = async (uid, ws) => {
  const user = await User.findOne({ uid }).exec();
  if (!user) {
    return { type: 'ERROR', message: 'User not found' };
  }

  // Get top players sorted by points
  const users = await User.find()
    .sort({ points: -1 })
    .select('id username points') // Only fetch required fields
    .exec();

  const currentIndex = users.findIndex(
    (u) => u.id.toString() === user.id.toString(),
  );

  if (currentIndex === -1) {
    return { type: 'ERROR', message: 'User not found in leaderboard' };
  }

  const rank = {
    position: currentIndex + 1,
  };

  // Build nearby list
  const nearby = [];

  if (currentIndex > 0) {
    nearby.push({
      userId: users[currentIndex - 1].id,
      username: users[currentIndex - 1].username,
      points: users[currentIndex - 1].points,
      position: currentIndex, // 1-based index
    });
  }

  nearby.push({
    userId: user.id,
    username: user.username,
    points: user.points,
    position: currentIndex + 1,
  });

  if (currentIndex < users.length - 1) {
    nearby.push({
      userId: users[currentIndex + 1].id,
      username: users[currentIndex + 1].username,
      points: users[currentIndex + 1].points,
      position: currentIndex + 2,
    });
  }

  await User.updateOne(
    { uid },
    {
      $set: {
        rank: nearby,
        position: rank.position,
      },
    },
  ).exec();

  return nearby;
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

  console.log();

  for (const uid of Object.keys(gameState.players)) {
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
  handleGameRequest,
  handleGameRequestAccepted,
  handleGameRequestDeclined,
  handleDisconnect,
  handleOnlineUsersRequest,
  broadcastOnlineUsers,
  broadcastToGame,
};
