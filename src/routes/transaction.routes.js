import express from 'express';
import {
  getTransactions,
  getTransactionDetails,
} from '../controllers/transaction.controller.js';

const router = express.Router();

router.get('/:userId', getTransactions);
router.get('/details/:transactionId', getTransactionDetails);

export default router;
