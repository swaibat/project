import express from 'express';
import {
  processDeposit,
  handlePaymentWebhook,
  withdrawMoney,
} from '../controllers/payment.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/deposit', verifyToken, processDeposit);
router.post('/withdraw', verifyToken, withdrawMoney);
router.post('/webhook', handlePaymentWebhook);

export default router;
