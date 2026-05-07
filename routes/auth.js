const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');

const router = express.Router();

// In-memory OTP store: { email: { otp, expiresAt } }
const otpStore = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// POST /auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Vasudha – Your OTP',
      text: `Your OTP is ${otp}. It expires in 10 minutes.`,
    });

    res.json({ message: 'OTP sent' });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];
  if (!record || record.otp !== otp || Date.now() > record.expiresAt)
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  res.json({ message: 'OTP verified' });
});

// POST /auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, otp, fullName, mobile, address, password } = req.body;

    const record = otpStore[email];
    if (!record || record.otp !== otp || Date.now() > record.expiresAt)
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    delete otpStore[email];

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, full_name, mobile, address, password_hash, role, coins)
       VALUES ($1,$2,$3,$4,$5,'customer',0) RETURNING id, email, full_name, mobile, role, coins`,
      [email, fullName, mobile, address, hash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Admin shortcut
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ id: 0, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { id: 0, email, full_name: 'Admin', role: 'admin' } });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Email not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Vasudha – Password Reset OTP',
      text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
    });

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const record = otpStore[email];
    if (!record || record.otp !== otp || Date.now() > record.expiresAt)
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    delete otpStore[email];

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    // Admin check
    if (email === process.env.ADMIN_EMAIL) {
      if (currentPassword !== process.env.ADMIN_PASSWORD)
        return res.status(401).json({ error: 'Current password is incorrect' });
      // For admin, just verify - can't change env password
      return res.json({ message: 'Admin password verified (stored in environment)' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
