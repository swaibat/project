import express from 'express';
import {
  processDeposit,
  handlePaymentWebhook,
} from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/deposit/:uid', processDeposit);
router.post('/webhook', handlePaymentWebhook);

export default router;
