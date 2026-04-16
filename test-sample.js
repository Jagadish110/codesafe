// Test file for knowledge graph
import express from 'express';
import { authenticate } from './auth';
import { connectDB } from './db';

const app = express();

app.get('/api/user', authenticate, (req, res) => {
  const userId = req.query.id;
  const user = connectDB().query('SELECT * FROM users WHERE id = ?', [userId]);
  res.json(user);
});

export default app;