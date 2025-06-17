import { WebSocket } from 'ws';
import { WebSocketMessageType } from '../../types/messageTypes';
import { broadcastOnlineUsers } from './broadcastOnlineUsers';
import { clients, gameStates, playerGameMap } from '../state';
import { registerClient, sendToClient } from '../wsUtil';
import { GameStatesMap, PlayerData } from '../types';
import { log } from 'console';

export interface IdentifyData extends PlayerData {
  gameStates: GameStatesMap;
}

interface HandleIdentifyProps {
  ws: WebSocket & { uid: string };
  data: IdentifyData;
}

// Implementation
export const handleIdentify = async ({
  ws,
  data,
}: HandleIdentifyProps): Promise<void> => {
  const { uid, username, balance, stake, avatar } = data;

  const playerData = { ws, username, balance, stake, avatar, uid };

  const gameId = playerGameMap.get(uid);
  // Reconnection case
  if (playerGameMap.has(uid) && gameId) {
    const oldGameState = gameStates.get(gameId);
    const { waitTimeout, moveTimeout, ...gameState } = oldGameState;

    if (gameState) {
      const now = Date.now();
      const isExpired =
        gameState.turnExpiresAt && now > gameState.turnExpiresAt;
      const isInvalidReadyState = gameState.ready && gameState.ready.size !== 2;

      if (isExpired) {
        // Clean up the expired/invalid game
        console.log(
          `Cleaning up ${isExpired ? 'expired' : 'invalid'} game ${gameId}`,
        );

        ws.uid = uid;

        clients.set(uid, {
          ws,
          username,
          balance,
          stake,
          avatar,
          uid,
        });

        ws.send(
          JSON.stringify({
            type: WebSocketMessageType.IDENTIFY,
          }),
        );

        // Cleanup game state
        gameStates.delete(gameId);
        await broadcastOnlineUsers();
        return;
      } else {
        // Game is valid, proceed with reconnection
        sendToClient({
          ws,
          message: {
            type: WebSocketMessageType.IDENTIFY,
            data: { gameState },
          },
        });

        playerData.ws.uid = uid;

        registerClient(playerData);
        console.log(`Player ${uid} reconnected to valid game ${gameId}`);
        return;
      }
    }

    // Cleanup stale mapping if game no longer exists
    playerGameMap.delete(uid);
  }

  // New connection or cleaned up invalid game
  ws.uid = uid;
  clients.set(uid, {
    ws,
    username,
    balance,
    stake,
    avatar,
    uid,
  });

  ws.send(
    JSON.stringify({
      type: WebSocketMessageType.IDENTIFY,
    }),
  );

  console.log(`Player ${uid} identified with no active games`);
  await broadcastOnlineUsers();
};
