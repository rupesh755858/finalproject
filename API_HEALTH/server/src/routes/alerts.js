import { Router } from 'express';
import AlertChannel from '../models/AlertChannel.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const channels = await AlertChannel.find({}).sort({ createdAt: -1 }).populate('owner', 'email name');
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, type = 'console', url, secret } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  if (['webhook', 'slack', 'discord'].includes(type) && !url) {
    return res.status(400).json({ error: 'url is required for this alert channel type' });
  }

  try {
    const channel = await AlertChannel.create({
      owner: req.userId,
      name,
      type,
      url: url || '',
      secret: secret || '',
      enabled: true,
    });
    res.status(201).json({ channel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await AlertChannel.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ error: 'channel not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
