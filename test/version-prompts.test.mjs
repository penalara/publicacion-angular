import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { askVersion } from '../src/prompts.mjs';
import { preparePackageVersion, readPackageInfo, validateVersion } from '../src/version.mjs';

test('valida SemVer completo', () => {
  assert.equal(validateVersion('1.2.3-rc.1+build.5'), '1.2.3-rc.1+build.5');
  for (const value of ['', '1.2', 'v1.2.3', '01.2.3']) {
    assert.throws(() => validateVersion(value), /SemVer/u);
  }
});

test('Enter acepta el siguiente patch sugerido', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  input.end('\n');
  assert.equal(await askVersion('1.2.3', { input, output }), '1.2.4');
});

test('sin TTY exige una version explicita', async () => {
  await assert.rejects(askVersion('1.2.3', { input: {}, output: {} }), /no interactiva/u);
});

test('actualiza y restaura exactamente package.json', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'package-version-'));
  const path = join(cwd, 'package.json');
  const original = '{\n  "name": "example-app",\n  "version": "1.0.0"\n}\n';
  await writeFile(path, original);
  try {
    const prepared = await preparePackageVersion('1.1.0', await readPackageInfo(cwd));
    assert.equal(JSON.parse(await readFile(path, 'utf8')).version, '1.1.0');
    await prepared.restore();
    assert.equal(await readFile(path, 'utf8'), original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
