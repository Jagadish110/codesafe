// Test file for knowledge graph
import express from 'express';
import { authenticate } from './auth';
import { connectDB } from './db';

const app = express();

app.get('/api/user', authenticate, (req, res) => {
  // Use the ID from the authenticated session, not from the URL query
  const userId = req.user.id;
  const user = connectDB().query('SELECT * FROM users WHERE id = ?', [userId]);
  res.json(user);
});

export default app;