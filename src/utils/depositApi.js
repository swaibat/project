import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

export const depositApi = async ({
  amount,
  provider,
  transactionId,
}) => {
  try {
    // Find and update transaction status to SUCCESS in one go
    const transaction = await Transaction.findOneAndUpdate(
      { transactionId },
      { status: 'SUCCESS', provider },
      { new: true }
    );

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Update user balance
    const user = await User.findOneAndUpdate(
      { uid: transaction.userUID },
      { $inc: { balance: amount } },
      { new: true }
    );

    return transaction;
  } catch (error) {
    console.error('Deposit processing error:', error);

    // Best effort: mark transaction as failed (only if it exists)
    await Transaction.findOneAndUpdate(
      { transactionId },
      { status: 'FAILED' }
    );

    throw error;
  }
};

export const depositFailed = async ({
  transactionId,
  provider,
}) => {
  try {

    const transaction = await Transaction.findOneAndUpdate(
      { transactionId },
      {
        status: 'FAILED',
        provider,
      },
      { new: true },
    ).populate('user');

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  } catch (error) {
    console.log('=====', error);
    // throw error;
  }
};
