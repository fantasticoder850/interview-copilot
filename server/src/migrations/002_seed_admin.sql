-- Seed the initial admin. The password is hashed with pgcrypto's bcrypt
-- (gen_salt('bf')), which produces a $2a$ hash that bcryptjs verifies.
INSERT INTO users (email, password_hash, name, role, status, approved_at)
VALUES (
  'reymark.g.pro@gmail.com',
  crypt('P@ssw0rd', gen_salt('bf', 12)),
  'Reymark',
  'admin',
  'approved',
  now()
)
ON CONFLICT (email) DO NOTHING;
