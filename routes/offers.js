const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const pool = require('../db');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'vasudha_offers', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
});

const upload = multer({ storage });

// GET /offers
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM offers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /offers  (multipart/form-data: title, price, description, image)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, price, description } = req.body;
    const image_url = req.file?.path;
    if (!title || !image_url) return res.status(400).json({ error: 'Title and image are required' });
    const result = await pool.query(
      'INSERT INTO offers (title, price, description, image_url) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, price || '', description || '', image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /offers/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM offers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
