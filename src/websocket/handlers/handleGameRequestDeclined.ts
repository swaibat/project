import { WebSocketMessageType } from '../../types/messageTypes';
import { clients, pendingRequests } from '../state';

export const handleGameRequestDeclined = async (data) => {
  const { requestId } = data.data;

  const request = pendingRequests.get(requestId);
  if (!request) return;
  if (request.timeout) {
    clearTimeout(request.timeout);
  }

  pendingRequests.delete(requestId);

  const sender = clients.get(request.opponent.uid);
  if (sender) {
    sender.ws.send(
      JSON.stringify({
        type: WebSocketMessageType.GAME_REQUEST_DECLINED,
        to: request.opponent.uid,
        from: request.user.uid,
      }),
    );
  }
};
