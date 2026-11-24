import mongoose from 'mongoose';

const checkSchema = new mongoose.Schema({
  monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  checkedAt: { type: Date, default: () => new Date(), index: true },
  ok: { type: Boolean, required: true },
  statusCode: { type: Number, default: null },
  latencyMs: { type: Number, default: null },
  timings: {
    dns: { type: Number, default: null },
    tcp: { type: Number, default: null },
    tls: { type: Number, default: null },
    ttfb: { type: Number, default: null },
  },
  error: { type: String, default: null },
});

checkSchema.index({ monitor: 1, checkedAt: -1 });

export default mongoose.model('Check', checkSchema);
