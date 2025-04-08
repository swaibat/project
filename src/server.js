import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleWebSocketConnection } from './websocket/wsHandler.js';
import { gameRoutes } from './routes/gameRoutes.js';


dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matatu')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/games', gameRoutes);

// WebSocket Connection Handler
wss.on('connection', handleWebSocketConnection);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});