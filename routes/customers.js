const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /customers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, mobile, address, role, coins, joined FROM users WHERE role = $1 ORDER BY joined DESC',
      ['customer']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /customers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, mobile, address, role, coins, joined FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /customers/:id/profile
router.patch('/:id/profile', async (req, res) => {
  try {
    const { full_name, mobile, address } = req.body;
    const result = await pool.query(
      'UPDATE users SET full_name=$1, mobile=$2, address=$3 WHERE id=$4 RETURNING id, email, full_name, mobile, address, coins, role, joined',
      [full_name, mobile, address, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /customers/:id/redeem
router.post('/:id/redeem', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const check = await pool.query('SELECT coins FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Customer not found' });
    if (check.rows[0].coins < amount) return res.status(400).json({ error: 'Insufficient coins' });
    const result = await pool.query(
      'UPDATE users SET coins = coins - $1 WHERE id = $2 RETURNING id, email, full_name, mobile, address, coins, role, joined',
      [amount, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /customers/:id/coins
router.patch('/:id/coins', async (req, res) => {
  try {
    const { amount } = req.body;
    const result = await pool.query(
      'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING id, email, full_name, mobile, coins',
      [amount, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
