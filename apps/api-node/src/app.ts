import express from 'express';
import dotenv from 'dotenv';
import { authMiddleware, requireAuthentication } from './middleware/auth.middleware';
import { getMe } from './modules/users/users.controller';

dotenv.config();

const app = express();
app.use(express.json());

// Base Clerk middleware for all API routes (sets req.auth if token exists)
app.use('/api', authMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-node' });
});

// Protected routes
app.get('/api/me', requireAuthentication, getMe);

export default app;
