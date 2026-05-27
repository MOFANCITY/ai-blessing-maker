import { createClient } from '@libsql/client/http';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const sqlPath = path.join(__dirname, 'init-couplet-db.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    // Split by statements and execute each one
    const statements = sqlContent
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await db.execute(statement);
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
