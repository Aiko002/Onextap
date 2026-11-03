/**
 * CLAUDE.md rule 6: credits and premium status change only through the server.
 *
 * profiles and credit_transactions are written by the service role (and the
 * sign-up trigger) only. RLS limits rows, not columns, so one write policy or
 * one grant to a browser role is enough to let a signed-in user set their own
 * credits or is_premium through the REST API (migration 008). This reads the
 * SQL files only; it does not reach a database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseDir = fileURLToPath(new URL('../../supabase/', import.meta.url));
const PROTECTED = /^(?:public\.)?(?:profiles|credit_transactions)$/i;
const BROWSER_ROLES = new Set(['anon', 'authenticated', 'public']);
const WRITES = /\b(?:insert|update|delete|all)\b/i;

function sqlFiles() {
  const migrations = readdirSync(path.join(supabaseDir, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => path.join('migrations', name));
  return ['schema.sql', ...migrations];
}

/** The file's statements, comments removed, whitespace collapsed. */
function statements(file) {
  const source = readFileSync(path.join(supabaseDir, file), 'utf8')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return source
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

test('no write policy on profiles or credit_transactions', () => {
  for (const file of sqlFiles()) {
    for (const statement of statements(file)) {
      const policy = statement.match(/^create policy (?:"[^"]*"|\S+) on (\S+)(.*)$/i);
      if (!policy || !PROTECTED.test(policy[1])) continue;
      // A policy without a FOR clause applies to ALL commands.
      const command = policy[2].match(/^\s*for (\w+)/i)?.[1] ?? 'all';
      assert.equal(command.toLowerCase(), 'select', `${file}: ${statement}`);
    }
  }
});

test('no write grant on profiles or credit_transactions to a browser role', () => {
  for (const file of sqlFiles()) {
    for (const statement of statements(file)) {
      const grant = statement.match(/^grant (.+?) on (.+?) to (.+)$/i);
      if (!grant || !WRITES.test(grant[1])) continue;
      const roles = grant[3].split(',').map((role) => role.trim().split(' ')[0].toLowerCase());
      if (!roles.some((role) => BROWSER_ROLES.has(role))) continue;
      const target = grant[2].replace(/^table /i, '').trim();
      const tables = target.split(',').map((table) => table.trim());
      assert.ok(
        !tables.some((table) => PROTECTED.test(table)) && !/^all tables in schema public$/i.test(target),
        `${file}: ${statement}`,
      );
    }
  }
});

test('schema.sql carries migration 008', () => {
  const schema = statements('schema.sql');
  for (const expected of statements(path.join('migrations', '008_no_browser_profile_writes.sql'))) {
    assert.ok(schema.includes(expected), `schema.sql is missing: ${expected}`);
  }
});
