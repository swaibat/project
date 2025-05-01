import  express from 'express';
import { getBonusStatus, claimBonus } from '../controllers/bonus.controller.js';

const router = express.Router();

router.get('/status', getBonusStatus);
router.post('/claim', claimBonus);

export default router;
