export const notifyExpiry = (requestId) => {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  const senderWs = clients.get(request.from);
  if (senderWs) {
    senderWs.send(
      JSON.stringify({
        type: 'GAME_REQUEST_EXPIRED',
        requestId,
      }),
    );
  }
};

export const generateId = () => {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
};
