import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: 'My channel', trim: true },
  type: { type: String, enum: ['console', 'webhook', 'slack', 'discord'], default: 'console' },
  url: { type: String, default: '', trim: true },
  secret: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('AlertChannel', channelSchema);
