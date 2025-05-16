// firebaseAdmin.js
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
