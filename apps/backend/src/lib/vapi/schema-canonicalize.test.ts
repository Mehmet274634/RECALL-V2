import { describe, it, expect } from 'vitest';
import {
  canonicalizeJson,
  canonicalizeAndStringify,
  hasToolSchemaDiff,
} from './schema-canonicalize.js';

describe('schema-canonicalize', () => {
  it('Aynı içerik, farklı anahtar sırası -> değişiklik yok', () => {
    const schemaA = {
      type: 'object',
      properties: {
        bField: {
          type: 'string',
          description: 'İkinci alan açıklaması',
        },
        aField: {
          description: 'Birinci alan açıklaması',
          type: 'string',
        },
      },
      required: ['aField', 'bField'],
    };

    const schemaB = {
      required: ['aField', 'bField'],
      properties: {
        aField: {
          type: 'string',
          description: 'Birinci alan açıklaması',
        },
        bField: {
          description: 'İkinci alan açıklaması',
          type: 'string',
        },
      },
      type: 'object',
    };

    expect(hasToolSchemaDiff(schemaA, schemaB)).toBe(false);
    expect(canonicalizeAndStringify(schemaA)).toBe(canonicalizeAndStringify(schemaB));
  });

  it('Bir description değişmiş -> fark var', () => {
    const schemaA = {
      type: 'object',
      properties: {
        patientName: {
          type: 'string',
          description: 'Hastanın adı ve soyadı',
        },
      },
      required: ['patientName'],
    };

    const schemaB = {
      type: 'object',
      properties: {
        patientName: {
          type: 'string',
          description: 'Hastanın tam adı ve soyadı (güncellendi)',
        },
      },
      required: ['patientName'],
    };

    expect(hasToolSchemaDiff(schemaA, schemaB)).toBe(true);
    expect(canonicalizeAndStringify(schemaA)).not.toBe(canonicalizeAndStringify(schemaB));
  });

  it('required dizisinin sırası değişmiş -> fark var (dizi sırası korunuyor)', () => {
    const schemaA = {
      type: 'object',
      properties: {
        date: { type: 'string' },
        time: { type: 'string' },
      },
      required: ['date', 'time'],
    };

    const schemaB = {
      type: 'object',
      properties: {
        date: { type: 'string' },
        time: { type: 'string' },
      },
      required: ['time', 'date'],
    };

    // Array order is preserved, so order difference in required yields a diff
    expect(hasToolSchemaDiff(schemaA, schemaB)).toBe(true);
    expect(canonicalizeAndStringify(schemaA)).not.toBe(canonicalizeAndStringify(schemaB));
  });

  it('handles nested objects, arrays of objects, and primitives properly', () => {
    expect(canonicalizeJson(null)).toBeNull();
    expect(canonicalizeJson('test')).toBe('test');
    expect(canonicalizeJson(42)).toBe(42);
    expect(canonicalizeJson(true)).toBe(true);

    const nested = {
      z: [{ b: 1, a: 2 }, { d: 4, c: 3 }],
      y: { beta: '2', alpha: '1' },
    };

    const canonical = canonicalizeJson(nested) as {
      y: Record<string, string>;
      z: Array<Record<string, number>>;
    };
    expect(Object.keys(canonical)).toEqual(['y', 'z']);
    expect(Object.keys(canonical.y)).toEqual(['alpha', 'beta']);
    expect(Object.keys(canonical.z[0])).toEqual(['a', 'b']);
    expect(Object.keys(canonical.z[1])).toEqual(['c', 'd']);
  });
});
