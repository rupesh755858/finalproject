import mongoose from 'mongoose';

const updateSchema = new mongoose.Schema({
  at: { type: Date, default: () => new Date() },
  message: { type: String, required: true },
}, { _id: false });

const incidentSchema = new mongoose.Schema({
  monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  state: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
  startedAt: { type: Date, default: () => new Date() },
  resolvedAt: { type: Date, default: null },
  cause: { type: String, default: '' },
  failureCount: { type: Number, default: 0 },
  updates: { type: [updateSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('Incident', incidentSchema);
