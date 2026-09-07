import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { detectArtifacts } from '../src/artifacts.mjs';

test('detecta layouts Angular CLI con language repetido', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'artifacts-cli-'));
  try {
    for (const language of ['es', 'en']) {
      const directory = join(cwd, 'dist', 'testing', language, 'browser', language);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'index.html'), language);
    }
    const artifacts = await detectArtifacts(
      'dist/testing/{language}/browser/{language}',
      'index.html',
      { cwd },
    );
    assert.deepEqual(artifacts.map(({ name }) => name), ['en', 'es']);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('detecta layouts Nx con language dentro del nombre', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'artifacts-nx-'));
  try {
    const directory = join(cwd, 'dist', 'apps', 'example-web-testing-en', 'en');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), 'en');
    const artifacts = await detectArtifacts(
      'dist/apps/example-web-testing-{language}/{language}',
      'index.html',
      { cwd },
    );
    assert.equal(artifacts[0].name, 'en');
    assert.equal(artifacts[0].localDirectory, directory);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('rechaza un artefacto sin el fichero requerido', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'artifacts-invalid-'));
  try {
    await mkdir(join(cwd, 'dist', 'testing', 'es'), { recursive: true });
    await assert.rejects(
      detectArtifacts('dist/testing/{language}', 'index.html', { cwd }),
      /archivo requerido/u,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
