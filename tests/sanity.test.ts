import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

describe('Sanity Check', () => {
  it('should initialize better-sqlite3 in memory', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO test (name) VALUES (?)').run('Xtract');
    const row = db.prepare('SELECT name FROM test WHERE id = 1').get() as { name: string };
    expect(row.name).toBe('Xtract');
  });
});
