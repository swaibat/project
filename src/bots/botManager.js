// botManager.js

import {
  createBotPlayer as createBot,
  startBotGame as startGame,
  handleBotMessage as processBotMessage,
  handleBotTurn,
} from './botPlayer.js';

// Store active bot games
const botGames = new Map();

/**
 * Create a bot player with a unique ID
 * @returns {Object} Bot player object
 */
export const createBotPlayer = () => {
  return createBot();
};

/**
 * Start a game with a bot
 * @param {Object} player - Human player
 * @param {Object} botPlayer - Bot player
 * @param {Map} clients - WebSocket clients map
 * @returns {Promise<Object>} GameState object
 */
export const startBotGame = async (player, botPlayer, clients) => {
  const gameState = await startGame(player, botPlayer, clients);

  botGames.set(gameState.gameId, {
    gameState,
    botId: botPlayer.id,
    uid: player.id,
  });

  return gameState;
};

/**
 * Process messages for bot games
 * @param {Object} ws - WebSocket connection
 * @param {Object} data - Message data
 * @param {Map} clients - WebSocket clients map
 * @returns {Promise<boolean>} True if message was handled as a bot message
 */
export const handleBotMessage = async (ws, data, clients) => {
  if (!data.data || !data.data.to) return false;

  const { to } = data.data;

  // Check if this is a message to a bot
  const isBotGame = to.startsWith('bot_');
  if (!isBotGame) return false;

  await processBotMessage(ws, data, clients);
  return true;
};

/**
 * Start a single-player game against a bot
 * @param {Object} ws - WebSocket connection
 * @param {string} uid - Player ID
 * @param {Map} clients - WebSocket clients map
 */
export const startSinglePlayerGame = async (ws, uid, clients) => {
  const botPlayer = createBotPlayer();
  const gameState = await startBotGame({ id: uid }, botPlayer, clients);

  ws.send(
    JSON.stringify({
      type: 'BOT_GAME_CREATED',
      gameId: gameState.gameId,
      botId: botPlayer.id,
      message: `Started a game with ${botPlayer.username}`,
    }),
  );

  return gameState;
};

/**
 * Clean up completed bot games
 */
export const cleanupBotGames = async () => {
  const { GameState } = await import('../models/GameState.js');

  for (const [gameId, game] of botGames.entries()) {
    const gameState = await GameState.findOne({ gameId });
    if (!gameState || gameState.status === 'COMPLETED') {
      botGames.delete(gameId);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupBotGames, 60 * 60 * 1000);
