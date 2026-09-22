import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('replace_with_')) throw new Error(`Set ${name} in .env`);
  return value;
}

const port = Number(process.env.PORT ?? '3000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const version = required('WHATSAPP_API_VERSION');
if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid WHATSAPP_API_VERSION');

export const config = {
  port,
  appSecret: required('META_APP_SECRET'),
  verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
  accessToken: required('WHATSAPP_ACCESS_TOKEN'),
  phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
  wabaId: required('WHATSAPP_WABA_ID'),
  apiVersion: version,
  dbPath: path.resolve(process.cwd(), 'db.json'),
  assetsPath: path.resolve(process.cwd(), 'Assets'),
};
