/** `npm run migrate -w @ustoz/api` — applies pending migrations and exits. */
import { migrate } from '@ustoz/db';
import { createPgDatabase } from '@ustoz/db/pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const db = createPgDatabase(url, 1);
console.log('applied:', (await migrate(db)).join(', ') || 'nothing');
await db.close();
