// src/utils/encryption.util.ts
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config(); // 👈 Cargar el .env manualmente

const ENCRYPTION_KEY = 'Kx93LpQvGzA1dS7uE8rTfY0cWbNh2jVk';
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const [ivBase64, contentBase64] = encryptedText.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  let decrypted = decipher.update(contentBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
