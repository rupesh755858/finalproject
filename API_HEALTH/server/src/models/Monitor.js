import mongoose from 'mongoose';

const monitorSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  method: { type: String, enum: ['GET', 'HEAD', 'POST', 'PUT'], default: 'GET' },
  headers: { type: Map, of: String, default: {} },
  body: { type: String, default: '' },
  intervalSeconds: { type: Number, default: 60, min: 10 },
  timeoutMs: { type: Number, default: 10000 },
  followRedirects: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true, index: true },
  assertions: {
    statusIn: { type: [Number], default: [200] },
    bodyContains: { type: String, default: '' },
    maxResponseMs: { type: Number, default: 0 },
  },
  consecutiveFailuresThreshold: { type: Number, default: 3 },

  // scheduling state - queue
  nextCheckAt: { type: Date, default: () => new Date(), index: true },
  lockedUntil: { type: Date, default: null },
  lockedBy: { type: String, default: null },

  // health state
  lastStatus: { type: String, enum: ['unknown', 'up', 'degraded', 'down'], default: 'unknown' },
  lastCheckedAt: { type: Date, default: null },
  currentFailures: { type: Number, default: 0 },
  openIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', default: null },
}, { timestamps: true });

monitorSchema.index({ isActive: 1, nextCheckAt: 1 });

export default mongoose.model('Monitor', monitorSchema);
