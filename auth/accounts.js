import { TargetPriority } from '../game/status.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const defaultSettings = () => ({ controlScale: 1, showNames: true });
export function validateSettings(value) {
  if (!value || ![.75,1,1.25,1.5].includes(value.controlScale) || typeof value.showNames !== 'boolean') throw Error('INVALID_SETTINGS');
  if (value.targetPriority !== undefined && !TargetPriority.includes(value.targetPriority)) throw Error('INVALID_SETTINGS');
  return { controlScale: value.controlScale, showNames: value.showNames, ...(value.targetPriority !== undefined ? {targetPriority:value.targetPriority} : {}) };
}
export function createAccountStore(file = '.data/accounts.json') {
  let accounts = [];
  try { accounts = JSON.parse(readFileSync(file, 'utf8')); if (!Array.isArray(accounts)) throw Error('Invalid account file'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const persist = next => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); renameSync(file + '.tmp', file); accounts = next; };
  return {
    find(id) { return accounts.find(a => a.id === id); },
    upsert(provider, subject, displayName) {
      let account = accounts.find(a => a.provider === provider && a.subject === subject);
      if (!account) { account = { id: 'acct_' + randomUUID(), provider, subject, displayName: String(displayName || '플레이어').slice(0,20), settings: defaultSettings() }; persist([...accounts, account]); }
      return account;
    },
    saveSettings(id, settings) {
      const account = accounts.find(a => a.id === id); if (!account) throw Error('ACCOUNT_NOT_FOUND');
      const saved = validateSettings(settings); persist(accounts.map(a => a.id === id ? { ...a, settings: saved } : a)); return saved;
    },
  };
}
