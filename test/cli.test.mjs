import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, runCli } from '../src/cli.mjs';
import { inferVersionMode } from '../src/release.mjs';

test('analiza entorno, version y flags en cualquier orden', () => {
  assert.deepEqual(
    parseArguments(['pruebas', '--resume', '1.2.3', '--new-version']),
    {
      environment: 'pruebas',
      requestedVersion: '1.2.3',
      explicitMode: 'new-version',
      resume: true,
      allowNonstandardSource: false,
      noVcsForce: false,
    },
  );
});

test('acepta no-vsc-force con no-version y rechaza sus combinaciones incompatibles', () => {
  assert.deepEqual(parseArguments(['pruebas', '--no-vsc-force', '--no-version']), {
    environment: 'pruebas',
    requestedVersion: undefined,
    explicitMode: 'no-version',
    resume: false,
    allowNonstandardSource: false,
    noVcsForce: true,
  });
  assert.throws(() => parseArguments(['pruebas', '--no-vsc-force', '--new-version']), /no es compatible/u);
  assert.throws(() => parseArguments(['pruebas', '1.2.3', '--no-vsc-force']), /version posicional/u);
  assert.throws(() => parseArguments(['pruebas', '--no-vsc-force', '--resume']), /--resume/u);
  assert.throws(
    () => parseArguments(['pruebas', '--no-vsc-force', '--allow-nonstandard-source']),
    /allow-nonstandard-source/u,
  );
});

test('no-vsc-force no crea ni consulta VCS', async () => {
  const calls = [];
  await runCli(['pruebas', '--no-vsc-force'], {
    loadConfig: async () => ({ name: 'Pruebas' }),
    vcsFactory: async () => { throw new Error('No debe crear VCS'); },
    forcedRelease: async (options) => { calls.push(options); },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].noVcsForce, true);
});

test('rechaza modos de version incompatibles', () => {
  assert.throws(
    () => parseArguments(['pruebas', '--new-version', '--no-version']),
    /mutuamente excluyentes/u,
  );
});

test('infiere no-version solo desde versionBranch', () => {
  assert.equal(inferVersionMode({ currentBranch: 'versions', versionBranch: 'versions' }), 'no-version');
  assert.equal(inferVersionMode({ currentBranch: 'main', versionBranch: 'versions' }), 'new-version');
  assert.equal(
    inferVersionMode({ explicitMode: 'new-version', currentBranch: 'versions', versionBranch: 'versions' }),
    'new-version',
  );
});
