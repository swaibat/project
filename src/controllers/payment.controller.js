import { mobileMoneyPayment } from '../utils/payments.js';
import { depositApi, depositFailed } from '../utils/depositApi.js';
import { WebSocketMessageType } from '../types/messageTypes.js';
import { sendPushNotification } from '../utils/pushNotifications.js';


export const processDeposit = async (req, res) => {
  try {
    const { amount } = req.body;

    const data = await mobileMoneyPayment(req.params.uid, {
      amount,
    });
    return res.status(200).send({ status: 200, data });
  } catch (error) {
    return res
      .status(422)
      .send({ status: 422, error: 'Unable to process your transaction' });
  }
};

export const handlePaymentWebhook = async (req, res) => {
  const {
    status,
    message,
    customer_reference,
    internal_reference,
    msisdn,
    amount,
    currency,
    provider,
    charge,
  } = req.body;

  try {
    if (status.toLowerCase() === 'success') {
      const depositResult = await depositApi({
        amount,
        infoMessage: message,
        provider,
        transactionId: internal_reference,
      });

      if (depositResult?.userId) {
        await sendTransactionNotification(req, depositResult.userId, {
          type: WebSocketMessageType.TRANSACTION_COMPLETED,
          accountId: depositResult.accountId,
          amount,
          transactionId: internal_reference,
          timestamp: new Date().toISOString(),
          message: 'Transaction completed successfully',
          title: 'Transaction Successful',
          data: {
            type: 'transaction',
            transactionId: internal_reference,
            amount,
            currency,
          },
        });
      }
    } else {
      const failureResult = await depositFailed({
        internal_reference,
        message,
        provider,
      });

      if (failureResult?.userId) {
        await sendTransactionNotification(req, failureResult.userId, {
          type: WebSocketMessageType.TRANSACTION_FAILED,
          transactionId: internal_reference,
          reason: message,
          timestamp: new Date().toISOString(),
          message: `Transaction failed: ${message}`,
          title: 'Transaction Failed',
          data: {
            type: 'transaction',
            transactionId: internal_reference,
            reason: message,
          },
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);

    if (customer_reference) {
      await sendTransactionNotification(req, customer_reference, {
        type: WebSocketMessageType.TRANSACTION_FAILED,
        transactionId: internal_reference,
        reason: 'Internal server error processing transaction',
        timestamp: new Date().toISOString(),
        message: 'Internal server error processing your transaction',
        title: 'Transaction Error',
      });
    }

    res.status(500).send('Internal Server Error');
  }
};

const sendTransactionNotification = async (req, userId, payload) => {
  req.sendToUser(userId, payload);

  await sendPushNotification(
    userId,
    payload.title || 'Transaction Update',
    payload.message || 'Your transaction status has changed',
    {
      type: 'transaction',
      ...payload.data,
    },
  );
};
