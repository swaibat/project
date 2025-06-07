import { WebSocketMessageType } from '../../types/messageTypes';
import { clients, pendingRequests, playerGameMap } from '../state';
import { WsProps } from '../types';
import { generateId } from '../wsUtil';

export const handleGameRequest = async ({ ws, data }:WsProps) => {
  const { user, opponent, stake } = data;
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
