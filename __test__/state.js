// src/state.js
class GameState {
  constructor(data) {
    this.gameId = data.gameId;
    this.players = data.players;
    this.status = data.status;
    this.userId = data.userId;
    this.currentTurn = data.currentTurn;
    this.cuttingCard = data.cuttingCard;
    this.deck = data.deck;
    this.ready = data.ready || {};
    this.playedCards = data.playedCards || [];
    this.currentCard = data.currentCard || null;
    this.chosenSuit = data.chosenSuit || null;
    this.createdAt = data.createdAt;
    this.stake = data.stake;
    this.meta = data.meta;
    this.activePenaltyCount = 0;
    this.drawStatus = new Map();
  }

  isPlayerTurn(playerId) {
    return this.currentTurn === playerId;
  }

  updateState(newState) {
    Object.assign(this, newState);
  }
}

module.exports = GameState;
