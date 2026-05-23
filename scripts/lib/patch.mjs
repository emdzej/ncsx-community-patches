/**
 * Minimal `.ncsxpatch.yaml` schema + parser, ESM JS edition.
 *
 * Mirrors the v1 schema from `@emdzej/ncsx-patches`. Kept inline here
 * so this repo is self-contained — no npm dependency on the unpublished
 * package, no submodule, no version pinning headaches. If the schema
 * gains v2 fields upstream, copy them across.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const ModulePatchSchema = z.object({
  module: z.string().min(1),
  coding_indexes: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  require_current: z.record(z.string()).optional(),
  edits: z
    .record(z.string())
    .refine((e) => Object.keys(e).length > 0, {
      message: 'edits must contain at least one FSW → PSW pair',
    }),
});

export const PatchFileSchema = z.object({
  schema: z.literal('ncsx-patch/v1'),
  title: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  chassis: z.string().min(1),
  modules: z.array(ModulePatchSchema).min(1),
});

/**
 * Read + parse + validate a patch file.
 * Throws on any failure with a path-prefixed message.
 */
export async function readPatch(filePath) {
  const text = await readFile(filePath, 'utf-8');
  let raw;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new Error(`${filePath}: YAML parse — ${err.message}`);
  }
  const result = PatchFileSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.length ? ` at ${first.path.join('.')}` : '';
    throw new Error(`${filePath}: invalid${where} — ${first?.message ?? 'unknown'}`);
  }
  return result.data;
}
