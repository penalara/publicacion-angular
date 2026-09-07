import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments } from '../src/cli.mjs';
import { inferVersionMode } from '../src/release.mjs';

test('analiza proyecto, entorno, version y flags en cualquier orden', () => {
  assert.deepEqual(
    parseArguments(['example-app', 'pruebas', '--resume', '1.2.3', '--new-version']),
    {
      project: 'example-app',
      environment: 'pruebas',
      requestedVersion: '1.2.3',
      explicitMode: 'new-version',
      resume: true,
      allowNonstandardSource: false,
    },
  );
});

test('rechaza modos de version incompatibles', () => {
  assert.throws(
    () => parseArguments(['example-app', 'pruebas', '--new-version', '--no-version']),
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
