import express from 'express';
import userRoutes from './user.routes.js';
import paymentRoutes from './payment.routes.js';
import transactionRoutes from './transaction.routes.js';

const router = express.Router();

router.use('/users', userRoutes);
router.use('/payments', paymentRoutes);
router.use('/transactions', transactionRoutes);

export default router;
