import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

export const depositApi = async ({
  amount,
  infoMessage,
  provider,
  transactionId,
}) => {
  try {
    // Find the transaction by internal_reference
    const transaction = await Transaction.findOne({
      internal_reference: transactionId,
    }).populate('user');

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Update user balance (example - adjust according to your logic)
    const user = await User.findByIdAndUpdate(
      transaction.user._id,
      { $inc: { balance: amount } },
      { new: true },
    );

    // Update transaction status
    const updatedTransaction = await Transaction.findOneAndUpdate(
      { internal_reference: transactionId },
      {
        status: 'SUCCESS',
        provider,
      },
      { new: true },
    );

    return {
      success: true,
      userId: user.uid,
      accountId: user.accountId,
      transaction: updatedTransaction,
    };
  } catch (error) {
    console.error('Deposit processing error:', error);

    // Mark transaction as failed
    await Transaction.findOneAndUpdate(
      { internal_reference: transactionId },
      {
        status: 'FAILED',
      },
    );

    throw error;
  }
};

export const depositFailed = async ({
  internal_reference,
  message,
  provider,
}) => {
  try {
    console.log(
      '====internal_reference=====',
      internal_reference,
    );
    
    const transaction = await Transaction.findOneAndUpdate(
      { internal_reference },
      {
        status: 'FAILED',
        provider,
      },
      { new: true },
    ).populate('user');

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return {
      success: false,
      userId: transaction.user?.uid,
      accountId: transaction.user?.accountId,
      transaction,
    };
  } catch (error) {
    console.log('=====', error);
    // throw error;
  }
};
