#!/usr/bin/env node
/**
 * Validate every `.ncsxpatch.yaml` under `patches/`. Used by the PR
 * workflow as a gate before merge — non-zero exit fails the check.
 *
 * Checks:
 *   1. Schema (via `readPatch` — zod validation, YAML parse)
 *   2. Chassis-dir convention: warn if `patches/<dir>/foo.ncsxpatch.yaml`
 *      has `chassis:` that doesn't match `<dir>` case-insensitively.
 *      This is a warning (not a failure) — directory casing is just a
 *      convention. But two different chassis under the same folder is
 *      almost always a bug, so we surface it.
 *   3. Filename hygiene: file basename uses kebab-case-ish characters.
 *      Warn only.
 */

import { readdir } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPatch } from './lib/patch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const PATCHES_DIR = join(REPO_ROOT, 'patches');

async function listPatchFiles(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.ncsxpatch.yaml')) out.push(p);
    }
  }
  await walk(dir);
  return out.sort();
}

const errors = [];
const warnings = [];

async function checkOne(file) {
  let patch;
  try {
    patch = await readPatch(file);
  } catch (err) {
    errors.push(err.message);
    return;
  }

  // Chassis dir vs patch.chassis
  const rel = relative(PATCHES_DIR, file);
  const dirName = rel.split('/')[0];
  if (dirName && dirName.toLowerCase() !== patch.chassis.toLowerCase()) {
    warnings.push(
      `${file}: chassis directory "${dirName}" doesn't match patch chassis "${patch.chassis}"`,
    );
  }

  // Filename hygiene
  const stem = basename(file, '.ncsxpatch.yaml');
  if (!/^[a-z0-9._-]+$/i.test(stem)) {
    warnings.push(`${file}: filename should use ASCII letters/digits/. _ - only (got "${stem}")`);
  }
}

async function main() {
  const files = await listPatchFiles(PATCHES_DIR);
  if (files.length === 0) {
    console.log('[validate] no patches yet — nothing to check');
    return;
  }
  for (const f of files) await checkOne(f);

  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);

  console.log(
    `[validate] ${files.length} file${files.length === 1 ? '' : 's'} · ` +
      `${errors.length} error${errors.length === 1 ? '' : 's'} · ` +
      `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
  );
  if (errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
