import express from 'express';
import userRoutes from './user.routes.js';
import paymentRoutes from './payment.routes.js';
import transactionRoutes from './transaction.routes.js';
import bonusRoutes from './bonus.routes.js';
import prizesRoutes from './prizes.routes.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use('/users', userRoutes);
router.use('/payments', paymentRoutes);
router.use('/transactions', verifyToken, transactionRoutes);
router.use('/bonus', verifyToken, bonusRoutes);
router.use('/prizes', prizesRoutes);

export default router;
