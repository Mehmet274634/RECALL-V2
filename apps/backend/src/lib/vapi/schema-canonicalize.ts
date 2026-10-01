/**
 * Canonicalization utilities for Vapi tool schema comparison.
 *
 * Recursively sorts all object keys alphabetically while strictly preserving
 * array element ordering (e.g. for `required` field lists where order can be semantic).
 */

export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson(obj[key]);
  }
  return result;
}

export function canonicalizeAndStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value), null, 2);
}

export function hasToolSchemaDiff(vapiSchema: unknown, localSchema: unknown): boolean {
  return canonicalizeAndStringify(vapiSchema) !== canonicalizeAndStringify(localSchema);
}
