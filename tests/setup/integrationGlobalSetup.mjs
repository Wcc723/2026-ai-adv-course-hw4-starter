import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const productionDatabasePath = path.resolve(currentDirectory, '../../database.sqlite');
let beforeSnapshot;

function snapshotDatabase() {
  if (!fs.existsSync(productionDatabasePath)) {
    return { exists: false };
  }

  const stats = fs.statSync(productionDatabasePath);
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(productionDatabasePath))
    .digest('hex');

  return {
    exists: true,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    hash
  };
}

export function setup() {
  beforeSnapshot = snapshotDatabase();
}

export function teardown() {
  const afterSnapshot = snapshotDatabase();
  if (JSON.stringify(afterSnapshot) !== JSON.stringify(beforeSnapshot)) {
    throw new Error('Integration Test 不得修改專案 database.sqlite');
  }
}
