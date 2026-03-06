'use strict';

const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const path = require('path');

const app = express();
const db = new Firestore();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function handleError(res, err, context = '') {
  console.error(`[${context}]`, err.message || err);
  res.status(500).json({ error: 'Internal server error' });
}

/* ─────────────────────────────────────────────
   USERS
   POST   /api/users          – find or create by username
   GET    /api/users/:id      – fetch user profile
───────────────────────────────────────────── */
app.post('/api/users', async (req, res) => {
  try {
    const username = (req.body.username || '').trim().slice(0, 40);
    if (!username) return res.status(400).json({ error: 'Username is required' });

    // Return existing user with this username
    const snap = await db.collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return res.json({ id: doc.id, username: doc.data().username });
    }

    // Create new user
    const ref = await db.collection('users').add({
      username,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id: ref.id, username });
  } catch (err) {
    handleError(res, err, 'POST /api/users');
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json({ id: doc.id, username: doc.data().username });
  } catch (err) {
    handleError(res, err, 'GET /api/users/:userId');
  }
});

/* ─────────────────────────────────────────────
   BEHAVIOURS
   GET    /api/users/:uid/behaviours
   POST   /api/users/:uid/behaviours
   PATCH  /api/users/:uid/behaviours/:id   – update completedDates
   DELETE /api/users/:uid/behaviours/:id
───────────────────────────────────────────── */
const behavioursRef = (uid) =>
  db.collection('users').doc(uid).collection('behaviours');

app.get('/api/users/:userId/behaviours', async (req, res) => {
  try {
    const snap = await behavioursRef(req.params.userId)
      .orderBy('createdDate', 'asc')
      .get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    handleError(res, err, 'GET behaviours');
  }
});

app.post('/api/users/:userId/behaviours', async (req, res) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 50);
    if (!name) return res.status(400).json({ error: 'Behaviour name is required' });

    const data = {
      name,
      createdDate: req.body.createdDate || todayISO(),
      completedDates: [],
    };

    const ref = await behavioursRef(req.params.userId).add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    handleError(res, err, 'POST behaviours');
  }
});

app.patch('/api/users/:userId/behaviours/:id', async (req, res) => {
  try {
    const { completedDates } = req.body;
    if (!Array.isArray(completedDates))
      return res.status(400).json({ error: 'completedDates must be an array' });

    // Sanitise: only valid YYYY-MM-DD strings, deduplicate
    const cleaned = [...new Set(
      completedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    )];

    await behavioursRef(req.params.userId)
      .doc(req.params.id)
      .update({ completedDates: cleaned });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'PATCH behaviours/:id');
  }
});

app.delete('/api/users/:userId/behaviours/:id', async (req, res) => {
  try {
    await behavioursRef(req.params.userId).doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'DELETE behaviours/:id');
  }
});

/* ─────────────────────────────────────────────
   TASKS
   GET    /api/users/:uid/tasks
   POST   /api/users/:uid/tasks
   PATCH  /api/users/:uid/tasks/:id   – toggle completed
   DELETE /api/users/:uid/tasks/:id
───────────────────────────────────────────── */
const tasksRef = (uid) =>
  db.collection('users').doc(uid).collection('tasks');

const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);

app.get('/api/users/:userId/tasks', async (req, res) => {
  try {
    const snap = await tasksRef(req.params.userId)
      .orderBy('createdDate', 'asc')
      .get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    handleError(res, err, 'GET tasks');
  }
});

app.post('/api/users/:userId/tasks', async (req, res) => {
  try {
    const name     = (req.body.name || '').trim().slice(0, 120);
    const priority = req.body.priority;
    const dueDate  = req.body.dueDate;

    if (!name)                         return res.status(400).json({ error: 'Task name is required' });
    if (!VALID_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Priority must be high, medium, or low' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD' });

    const data = {
      name,
      priority,
      dueDate,
      completed: false,
      createdDate: todayISO(),
    };

    const ref = await tasksRef(req.params.userId).add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    handleError(res, err, 'POST tasks');
  }
});

app.patch('/api/users/:userId/tasks/:id', async (req, res) => {
  try {
    const { completed } = req.body;
    if (typeof completed !== 'boolean')
      return res.status(400).json({ error: 'completed must be a boolean' });

    await tasksRef(req.params.userId)
      .doc(req.params.id)
      .update({ completed });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'PATCH tasks/:id');
  }
});

app.delete('/api/users/:userId/tasks/:id', async (req, res) => {
  try {
    await tasksRef(req.params.userId).doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'DELETE tasks/:id');
  }
});

/* ─────────────────────────────────────────────
   SPA fallback — serve index.html for all
   unmatched routes so client-side routing works
───────────────────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ─────────────────────────────────────────────
   Start
───────────────────────────────────────────── */
const PORT = parseInt(process.env.PORT, 10) || 8080;
app.listen(PORT, () => {
  console.log(`Trakr listening on port ${PORT}`);
});
