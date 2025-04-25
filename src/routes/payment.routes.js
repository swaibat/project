import express from 'express';
import {
  processDeposit,
  handlePaymentWebhook,
  withdrawMoney,
} from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/deposit/:uid', processDeposit);
router.post('/withdraw/:uid', withdrawMoney);
router.post('/webhook', handlePaymentWebhook);

export default router;
