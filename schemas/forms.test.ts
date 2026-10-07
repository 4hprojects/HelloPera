import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMS } from './forms';

/**
 * Keeps `FORMS` and the actions in step. An action that reads a field its
 * schema does not allow would refuse every real submission; a field allowed
 * but never read is an opening nothing uses.
 */

const ACTIONS_DIR = join(__dirname, '..', 'app', 'actions');

type Found = { file: string; name: string; key: string; reads: Set<string> };

function actions(): Found[] {
  const out: Found[] = [];
  for (const file of readdirSync(ACTIONS_DIR).filter((f) => /^\w+\.ts$/.test(f))) {
    const src = readFileSync(join(ACTIONS_DIR, file), 'utf8');

    // Module-level helpers that read from a FormData argument.
    const helpers = new Map<string, Set<string>>();
    for (const m of src.matchAll(
      /\nfunction (\w+)\(\s*formData: FormData[^)]*\)[^{]*\{([\s\S]*?)\n\}/g,
    )) {
      helpers.set(
        m[1]!,
        new Set(
          [...m[2]!.matchAll(/formData\.get\(\s*'([^']+)'\s*\)/g)].map((r) => r[1]!),
        ),
      );
    }

    for (const part of src.split(/\n(?=export async function )/).slice(1)) {
      const body = part.split('\nexport ')[0]!;
      const name = /export async function (\w+)/.exec(body)![1]!;
      const schemaRef = /formRejected\(\s*formData,\s*FORMS\.(\w+)\.(\w+)/.exec(body);
      const takesForm = /\(\s*[^()]*formData: FormData[^()]*\)/.test(body.split('{')[0]!);
      if (!takesForm) continue;
      const reads = new Set(
        [...body.matchAll(/formData\.get\(\s*'([^']+)'\s*\)/g)].map((r) => r[1]!),
      );
      for (const [helper, keys] of helpers) {
        if (new RegExp(`\\b${helper}\\(formData`).test(body))
          keys.forEach((k) => reads.add(k));
      }
      out.push({
        file,
        name,
        key: schemaRef ? `${schemaRef[1]}.${schemaRef[2]}` : '',
        reads,
      });
    }
  }
  return out;
}

const found = actions();

describe('server action form schemas', () => {
  it('finds the actions', () => {
    expect(found.length).toBeGreaterThan(40);
  });

  it.each(found.map((a) => [`${a.file}:${a.name}`, a] as const))(
    '%s checks its form first and matches its schema',
    (_label, action) => {
      expect(action.key, 'every FormData action must call formRejected').not.toBe('');
      const [group, entry] = action.key.split('.') as [keyof typeof FORMS, string];
      expect(action.file).toBe(`${group}.ts`);
      const schema = (FORMS[group] as Record<string, { fields: readonly string[] }>)[
        entry
      ];
      expect(schema, `FORMS.${action.key} exists`).toBeDefined();
      const allowed = new Set(schema!.fields);
      expect(
        [...action.reads].filter((k) => !allowed.has(k)),
        'read but not allowed',
      ).toEqual([]);
      expect(
        [...allowed].filter((k) => !action.reads.has(k)),
        'allowed but never read',
      ).toEqual([]);
    },
  );
});
