// src/game/gameHandler.ts
// import { activeBots } from '@/bot/botManager';

import { WebSocketMessageType } from "../types/messageTypes";

export const updateGameState = async (gameState) => {
  // Save updated state
  await gameState.save();
  
  // Notify all players (including bots)
  for (const [playerId] of gameState.players) {
    const isBot = activeBots.has(playerId);
    const message = {
      type: WebSocketMessageType.GAME_STATE_UPDATE,
      gameState,
      isYourTurn: gameState.currentTurn === playerId
    };
    
    if (isBot) {
      // Send directly to bot's message handler
      activeBots.get(playerId)?.ws.emit('message', JSON.stringify(message));
    } else {
      // Send to real player via WebSocket
      const playerWs = getPlayerWebSocket(playerId);
      playerWs?.send(JSON.stringify(message));
    }
    
    if (gameState.currentTurn === playerId) {
      const turnMessage = {
        type: WebSocketMessageType.YOUR_TURN,
        gameState
      };
      
      if (isBot) {
        activeBots.get(playerId)?.ws.emit('message', JSON.stringify(turnMessage));
      } else {
        playerWs?.send(JSON.stringify(turnMessage));
      }
    }
  }
};