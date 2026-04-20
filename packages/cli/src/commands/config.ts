import * as p from '@clack/prompts';
import Conf from 'conf';
import pc from 'picocolors';

interface ShedConfigStore {
  scan: { maxDepth: number; maxAgeDays: number };
  clean: { hardDelete: boolean };
  ai: { provider: 'anthropic' | 'openai' | 'ollama'; model: string };
}

const DEFAULTS: ShedConfigStore = {
  scan: { maxDepth: 8, maxAgeDays: 30 },
  clean: { hardDelete: false },
  ai: { provider: 'anthropic', model: 'claude-opus-4-7' },
};

/** Flat key → getter/setter helpers for user-facing CLI. */
const KEY_DEFS: Record<string, { get: (s: ShedConfigStore) => unknown; description: string }> = {
  'scan.maxDepth': { get: (s) => s.scan.maxDepth, description: 'Max filesystem depth for scan' },
  'scan.maxAgeDays': {
    get: (s) => s.scan.maxAgeDays,
    description: 'Min age (days) before item is surfaced',
  },
  'clean.hardDelete': {
    get: (s) => s.clean.hardDelete,
    description: 'Permanently delete instead of Trash',
  },
  'ai.provider': {
    get: (s) => s.ai.provider,
    description: 'AI provider (anthropic|openai|ollama)',
  },
  'ai.model': { get: (s) => s.ai.model, description: 'AI model name' },
};

function getStore(): Conf<ShedConfigStore> {
  return new Conf<ShedConfigStore>({ projectName: 'shed', defaults: DEFAULTS });
}

function flatGet(store: Conf<ShedConfigStore>, key: string): unknown {
  const def = KEY_DEFS[key];
  if (!def) return undefined;
  // Deep-merge stored sections with defaults so partial writes still show full config
  const saved = store.store as Partial<ShedConfigStore>;
  const merged: ShedConfigStore = {
    scan: { ...DEFAULTS.scan, ...(saved.scan ?? {}) },
    clean: { ...DEFAULTS.clean, ...(saved.clean ?? {}) },
    ai: { ...DEFAULTS.ai, ...(saved.ai ?? {}) },
  };
  return def.get(merged);
}

function flatSet(store: Conf<ShedConfigStore>, key: string, raw: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 2) return false;
  const [section, field] = parts as [string, string];

  const current = store.get(section as keyof ShedConfigStore) as Record<string, unknown>;
  if (typeof current !== 'object' || current === null) return false;

  const existing = current[field];
  let parsed: unknown;
  if (typeof existing === 'boolean') {
    if (raw === 'true') parsed = true;
    else if (raw === 'false') parsed = false;
    else return false;
  } else if (typeof existing === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) return false;
    parsed = n;
  } else {
    parsed = raw;
  }

  store.set(
    section as keyof ShedConfigStore,
    { ...current, [field]: parsed } as ShedConfigStore[keyof ShedConfigStore],
  );
  return true;
}

export async function configCommand(action?: string, key?: string, value?: string): Promise<void> {
  p.intro(pc.bgBlue(pc.black(' shed config ')));

  const store = getStore();

  switch (action) {
    case 'list':
    case undefined: {
      const lines = Object.entries(KEY_DEFS).map(([k, def]) => {
        const val = flatGet(store, k);
        const isDefault = String(val) === String(def.get(DEFAULTS));
        const valStr = isDefault ? pc.dim(String(val)) : pc.cyan(String(val));
        return `  ${k.padEnd(22)} ${valStr}${isDefault ? pc.dim('  (default)') : ''}`;
      });
      p.note(lines.join('\n'), 'Current configuration');
      p.note(pc.dim(store.path), 'Config file');
      break;
    }

    case 'get': {
      if (!key || !(key in KEY_DEFS)) {
        p.cancel(
          !key
            ? 'Usage: shed config get <key>'
            : `Unknown key: ${key}\nValid: ${Object.keys(KEY_DEFS).join(', ')}`,
        );
        process.exit(1);
      }
      console.log(flatGet(store, key));
      break;
    }

    case 'set': {
      if (!key || value === undefined) {
        p.cancel('Usage: shed config set <key> <value>');
        process.exit(1);
      }
      if (!(key in KEY_DEFS)) {
        p.cancel(`Unknown key: ${key}\nValid: ${Object.keys(KEY_DEFS).join(', ')}`);
        process.exit(1);
      }
      if (!flatSet(store, key, value)) {
        p.cancel(`Invalid value "${value}" for key "${key}"`);
        process.exit(1);
      }
      p.outro(`${pc.cyan(key)} = ${pc.green(value)}`);
      return;
    }

    case 'reset': {
      if (key) {
        if (!(key in KEY_DEFS)) {
          p.cancel(`Unknown key: ${key}`);
          process.exit(1);
        }
        const [section] = key.split('.') as [keyof ShedConfigStore];
        store.set(section, DEFAULTS[section]);
        p.outro(`${pc.cyan(key)} reset to default.`);
      } else {
        const confirmed = await p.confirm({
          message: 'Reset ALL settings to defaults?',
          initialValue: false,
        });
        if (p.isCancel(confirmed) || !confirmed) {
          p.cancel('Cancelled.');
          return;
        }
        store.clear();
        p.outro('All settings reset to defaults.');
      }
      return;
    }

    default:
      p.cancel(`Unknown action: ${action}\nUsage: shed config [list|get|set|reset]`);
      process.exit(1);
  }

  p.outro(pc.dim(`Edit directly: ${store.path}`));
}
