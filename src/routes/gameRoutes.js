import express from 'express';
import { GameState } from '../models/GameState.js';
import { initializeDeck } from '../utils/cardUtils.js';

const router = express.Router();

// Create a new game
router.post('/', async (req, res) => {
  try {
    const { players } = req.body;
    
    // Initialize deck and deal cards
    const { deck, playerHands, cuttingCard } = initializeDeck(players);
    
    const gameState = await GameState.create({
      chosenSuit: cuttingCard.suit,
      players: Object.fromEntries(
        players.map((playerId, index) => [playerId, playerHands[index]])
      ),
      deck,
      playedCards: [],
      cuttingCard,
      currentTurn: players[0],
      createdAt: new Date()
    });
    
    res.status(201).json(gameState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get game state
router.get('/:gameId', async (req, res) => {
  try {
    const gameState = await GameState.findOne({ gameId: req.params.gameId });
    if (!gameState) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(gameState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active games
router.get('/', async (req, res) => {
  try {
    const games = await GameState.find({ winner: null });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active games by user ID
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const games = await GameState.find({
      winner: null,
      [`players.${userId}`]: { $exists: true }
    });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const gameRoutes = router;