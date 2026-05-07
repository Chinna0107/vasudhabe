CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        VARCHAR(255) UNIQUE NOT NULL,
  full_name    VARCHAR(255) NOT NULL,
  mobile       VARCHAR(20),
  address      TEXT,
  password_hash TEXT NOT NULL,
  role         VARCHAR(20) DEFAULT 'customer',
  coins        INTEGER DEFAULT 0,
  joined       TIMESTAMP DEFAULT NOW()
);
