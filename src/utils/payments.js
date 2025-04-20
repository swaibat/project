import axios from 'axios';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

const formatMsisdn = (phone) => {
  if (phone.startsWith('0')) {
    return '+256' + phone.slice(1);
  }
  return phone;
};

export const validatePhone = async (msisdn) => {
  console.log('==ddd==', msisdn);
  try {
    const apiKey = 'a6d10c136873fd.e0jfX4fshl9u_YyDvkiiXA';
    const response = await axios.post(
      'https://payments.relworx.com/api/mobile-money/validate',
      { msisdn },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.relworx.v2',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    console.log('===', error.message);
    throw Error(error);
  }
};

export const mobileMoneyPayment = async (userUID, { amount }) => {
  try {
    const apiKey = 'a6d10c136873fd.e0jfX4fshl9u_YyDvkiiXA';
    const internal_reference = generateRandomToken();

    console.log('internal_reference', userUID, internal_reference);

    // First create the transaction record
    const user = await User.findOne({ uid: userUID });
    if (!user) {
      throw new Error('User account not found');
    }

    const msisdn = formatMsisdn(user.phoneNumber || '0766389284');

    const newTransaction = await Transaction.create({
      internal_reference,
      userUID: user.uid,
      msisdn,
      amount,
      currency: 'UGX',
      status: 'PENDING',
      type: 'DEPOSIT',
      user: user.uid,
    });

    // Then make the payment request
    const response = await axios.post(
      'https://payments.relworx.com/api/mobile-money/request-payment',
      {
        account_no: 'REL30D14C8768',
        reference: internal_reference,
        msisdn,
        currency: 'UGX',
        amount: amount,
        description: 'Payment Request',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.relworx.v2',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    // Update transaction with initial response
    await Transaction.findOneAndUpdate(
      { internal_reference },
      {
        status: 'PENDING'
      },
    );

    return {
      ...response.data,
      internal_reference,
      user: {
        uid: user.uid,
        accountId: user.accountId,
      },
    };
  } catch (error) {
    console.error('Payment error:', error);

    // Update transaction as failed if it was created
    if (internal_reference) {
      await Transaction.findOneAndUpdate(
        { internal_reference },
        {
          status: 'FAILED'
        },
      );
    }

    throw error;
  }
};

export const sendPayment = async ({ msisdn, amount, description }) => {
  try {
    const apiKey = 'a6d10c136873fd.e0jfX4fshl9u_YyDvkiiXA';
    const reference = generateRandomToken();

    const response = await axios.post(
      'https://payments.relworx.com/api/mobile-money/send-payment',
      {
        account_no: 'REL30D14C8768',
        reference,
        msisdn,
        currency: 'UGX',
        amount,
        description: description || 'Send Payment',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.relworx.v2',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.log(
      'Send Payment Error:',
      error?.response?.data?.message || error.message,
    );
    throw new Error(error?.response?.data?.message || 'Send payment failed');
  }
};

function generateRandomToken(length = 32) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
