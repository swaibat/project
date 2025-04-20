import User from '../models/User.js';
import AccountCounter from '../models/AccountCounter.js';

export const createUser = async (req, res) => {
  const { uid, username, email, photoURL } = req.body;
  try {
    const existing = await User.findOne({ uid });
    if (existing) return res.status(200).json(existing);

    let counter = await AccountCounter.findOne();
    if (!counter) {
      counter = await AccountCounter.create({ lastAccountId: 2000 });
    }

    const accountId = counter.lastAccountId + 1;
    counter.lastAccountId = accountId;
    await counter.save();

    const newUser = await User.create({
      uid,
      accountId,
      username,
      email,
      photoURL,
    });

    res.status(201).json(newUser);
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Error creating user', error: err.message });
  }
};

export const getUser = async (req, res) => {
  const { uid } = req.params;

  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Error fetching user', error: err.message });
  }
};

export const updateUser = async (req, res) => {
  const { uid } = req.params;
  const updateData = req.body;

  try {
    const user = await User.findOneAndUpdate({ uid }, updateData, {
      new: true,
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Error updating user', error: err.message });
  }
};
