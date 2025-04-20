// models/User.ts
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  accountId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  email: { type: String, default: '' },
  photoURL: { type: String, default: null },
  balance: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  lastPlayed: { type: Date, default: null },
  online: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  fcmToken: { type: String, default: '' },
});

export default mongoose.model('User', userSchema);
