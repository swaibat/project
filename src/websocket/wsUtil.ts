import { WebSocket } from 'ws';
import { broadcastOnlineUsers } from './handlers/broadcastOnlineUsers';
import { clients, gameStates, PLAY_TIMEOUT_DURATION } from './state';
import { ClientsMap, PlayerData } from './types';
import { endGame } from './handlers/endGame';

interface GameRequest {
  from: string;
  to: string;
  stake: number;
  timestamp: number;
  timeout: NodeJS.Timeout;
}

interface GameState {
  players: Record<string, any[]>;
  deck?: any[];
  currentTurn?: string;
  status?: string;
  turnExpiresAt?: number;
  gameOver?: boolean;
  winner?: string;
  ready?: Set<string>;
  waitTimeout?: NodeJS.Timeout;
  moveTimeout?: NodeJS.Timeout;
}

type PendingRequestsMap = Map<string, GameRequest>;
type GameStatesMap = Map<string, GameState>;

// Utility Functions
interface NotifyExpiryProps {
  requestId: string;
  pendingRequests: PendingRequestsMap;
  clients: ClientsMap;
}

export const notifyExpiry = ({
  requestId,
  pendingRequests,
  clients,
}: NotifyExpiryProps): void => {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  const sender = clients.get(request.from);
  if (sender) {
    sender.ws.send(
      JSON.stringify({
        type: 'GAME_REQUEST_EXPIRED',
        requestId,
      }),
    );
  }
};

export const generateId = (): string => {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
};

interface BroadcastToGameProps {
  gameId: string;
  message: any;
}

export const broadcastToGame = ({
  gameId,
  message,
}: BroadcastToGameProps): void => {
  const gameState = gameStates.get(gameId);
  if (!gameState) return;

  for (const uid of Object.keys(gameState.players)) {
    const client = clients.get(uid);
    if (client) {
      client.ws.send(JSON.stringify(message));
    }
  }
};

export const registerClient = (playerData: PlayerData): void => {
  clients.set(playerData.ws.uid, playerData);
  playerData.ws.uid = playerData.ws.uid;
};

interface SendToClientProps {
  ws: WebSocket;
  message: any;
}

export const sendToClient = ({ ws, message }: SendToClientProps): void => {
  ws.send(JSON.stringify(message));
};

interface HandleDisconnectProps {
  ws: WebSocket & { uid?: string };
  clients: ClientsMap;
}

export const handleDisconnect = async ({
  ws,
}: HandleDisconnectProps): Promise<void> => {
  if (ws.uid) {
    clients.delete(ws.uid);
    console.log(`Player ${ws.uid} disconnected`);
    await broadcastOnlineUsers();
  }
};

export const startTimeout = (gameId) => {
  const gameState = gameStates.get(gameId);
  if (!gameState) return;

  // Clear any existing timeout
  if (gameState.moveTimeout) {
    clearTimeout(gameState.moveTimeout);
    gameState.moveTimeout = setTimeout(() => {
      const inactivePlayer = gameState.currentTurn;
      const allPlayers = Object.keys(gameState.players);
      const opponent = allPlayers.find(
        (playerId) => playerId !== inactivePlayer,
      );

      // End game due to timeout
      endGame({
        gameId,
        winner: opponent!,
        loser: inactivePlayer,
        reason: 'TIMEOUT',
      });
    }, PLAY_TIMEOUT_DURATION);
  }

  if (gameState.waitTimeout) {
    clearTimeout(gameState.waitTimeout);
    gameState.waitTimeout = setTimeout(() => {
      const inactivePlayer = gameState.currentTurn;
      const allPlayers = Object.keys(gameState.players);
      const opponent = allPlayers.find(
        (playerId) => playerId !== inactivePlayer,
      );

      // End game due to timeout
      endGame({
        gameId,
        winner: opponent!,
        loser: inactivePlayer,
        reason: 'TIMEOUT',
      });
    }, PLAY_TIMEOUT_DURATION);
  }

  // Update the game state with new timeout
  gameStates.set(gameId, gameState);
};
