import User from '../models/User.js';

export const updateBonusCoins = async (user) => {
  const now = Date.now();
  let lastBonus = user.lastBonusTime ? user.lastBonusTime.getTime() : 0;

  let bonusCoins = user.bonusCoins || 0;

  // Keep adding coins if enough time has passed and bonus is less than 4
  while (now - lastBonus >= 5 * 60 * 60 * 1000 && bonusCoins < 1) {
    bonusCoins += 1;
    lastBonus += 5 * 60 * 60 * 1000; // Add 5 hours to last bonus time
  }

  if (bonusCoins !== user.bonusCoins) {
    user.bonusCoins = bonusCoins;
    user.lastBonusTime = new Date(lastBonus);
    await user.save();
  }

  const nextBonusIn =
    bonusCoins >= 4
      ? null
      : Math.max(0, (5 * 60 * 60 * 1000 - (now - lastBonus)) / (1000 * 60 * 60)); // in hours

  return {
    bonusCoins: user.bonusCoins,
    nextBonusIn, // hours left to next bonus (null if max coins)
  };
};

export const getBonusStatus = async (req, res) => {
  try {
    const bonusData = await updateBonusCoins(req.user);
    return res.status(200).send({ data: bonusData });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const claimBonus = async (req, res) => {
  const { user } = req;
  try {
    if (user.bonusCoins > 0) {
      user.balance += user.bonusCoins;
      user.bonusCoins = 0;
      user.lastBonusTime = new Date();
      await user.save();
      return res.status(200).send({ balance: user.balance });
    } else {
      return res.status(400).json({ error: 'No bonus coins to claim.' });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
