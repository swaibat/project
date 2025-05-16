import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleWebSocketConnection } from './websocket/wsHandler.js';
import router from './routes/index.js';
import { startBonusCron } from './utils/bonusCron.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Store active connections with user mapping
const activeConnections = new Map(); // userId -> WebSocket

// Middleware to make WebSocket functions available in routes
app.use((req, res, next) => {
  req.sendToUser = (userId, message) => {
    const ws = activeConnections.get(userId);
    if (ws && ws?.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };
  req.broadcast = (message) => {
    activeConnections.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  };
  next();
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  handleWebSocketConnection(ws);
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'IDENTIFY' && data.data.uid) {
        // Map user ID to WebSocket connection
        activeConnections.set(data.data.uid, ws);
        ws.userId = data.data.uid;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    if (ws.userId) {
      activeConnections.delete(ws.userId);
    }
  });
});

// MongoDB Connection

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matatu')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api', router);

startBonusCron(activeConnections);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
