import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  internal_reference: { type: String, required: true, unique: true },
  userUID: { type: String }, // Could be user ID or account number
  msisdn: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'UGX' },
  provider: { type: String },
  charge: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['PENDING', 'SUCCESS', 'FAILED'], 
    default: 'PENDING' 
  },
  type: { 
    type: String, 
    enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'], 
    required: true 
  },
  description: { type: String },
  user: { type: String }
}, { timestamps: true });

// Add indexes for faster queries
transactionSchema.index({ internal_reference: 1 });
transactionSchema.index({ customer_reference: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: 1 });

export default mongoose.model('Transaction', transactionSchema);