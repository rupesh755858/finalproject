import mongoose from 'mongoose';

// One document per (incident, channel, event). The unique index IS the dedup:
// a second insert for the same key fails with code 11000, so nothing double-sends.
const logSchema = new mongoose.Schema({
  dedupKey: { type: String, required: true, unique: true },
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'AlertChannel' },
  event: { type: String, enum: ['opened', 'acknowledged', 'resolved'], required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date() },
});

export default mongoose.model('NotificationLog', logSchema);
