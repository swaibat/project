// services/bonusService.js
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotifications.js';

const BONUS_INTERVAL_MS = 1000; // 5 hours
const MAX_BONUS_COINS = 1;

export const processBonusUpdates = async (req) => {
  const now = Date.now();
  const thresholdTime = new Date(now - BONUS_INTERVAL_MS);

  // Find users who are eligible for bonus coins
  const users = await User.find({
    bonusCoins: { $lt: MAX_BONUS_COINS },
    lastBonusTime: { $lte: thresholdTime },
    fcmToken: { $exists: true, $ne: null }, // make sure they can receive push
  });

  console.log('users==', users);

  for (const user of users) {
    let lastBonus = user.lastBonusTime ? user.lastBonusTime.getTime() : 0;
    let bonusCoins = user.bonusCoins || 0;
    let coinsAdded = 0;

    while (
      now - lastBonus >= BONUS_INTERVAL_MS &&
      bonusCoins < MAX_BONUS_COINS
    ) {
      bonusCoins += 1;
      coinsAdded += 1;
      lastBonus += BONUS_INTERVAL_MS;
    }

    if (coinsAdded >= 0) {
      user.bonusCoins = bonusCoins;
      user.lastBonusTime = new Date(lastBonus);
      await user.save();

      // Send socket.io event if user is connected
      if (req && typeof req.sendToUser === 'function') {
        req.sendToUser(user.uid, {
          type: 'BONUS_UPDATE',
          data: {
            bonusCoins: user.bonusCoins,
            lastBonusTime: user.lastBonusTime
          }
        });
      }

      await sendPushNotification(
        user.uid,
        `💰 You've Got Bonus Coin!`,
        `You've earned 1 bonus coin! Tap to claim now!`,
        { type: 'BONUS_AVAILABLE' },
      );
    }
  }
};