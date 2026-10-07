import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivationRollbackError } from '../src/errors.mjs';
import { publishArtifacts } from '../src/publication.mjs';

class FakeTransport {
  constructor(paths = []) {
    this.paths = new Set(paths);
    this.operations = [];
  }
  async exists(path) { return this.paths.has(path); }
  async uploadDirectory(local, remote) { this.operations.push(['upload', local, remote]); this.paths.add(remote); }
  async removeDirectory(path) { this.operations.push(['remove', path]); this.paths.delete(path); }
  async rename(source, destination) {
    this.operations.push(['rename', source, destination]);
    if (source === this.failFor) throw new Error('rename failed');
    if (source === this.rollbackFailFor) throw new Error('rollback failed');
    assert(this.paths.has(source));
    this.paths.delete(source);
    this.paths.add(destination);
  }
}

class RemoteFakeTransport {
  constructor() { this.operations = []; }
  async removeDirectories(paths) { this.operations.push(['remove', paths]); }
  async uploadDirectories(entries) { this.operations.push(['upload', entries]); }
  async finalizeArtifacts(entries) {
    this.operations.push(['finalize', entries]);
    if (this.permissionsFail) throw new Error('chmod failed');
  }
}

const options = (transport) => ({
  transport,
  artifacts: [{ name: 'es', localDirectory: '/local/es' }],
  remoteDirectory: '/www',
  log() {},
});

test('publica mediante new, activo y old', async () => {
  const transport = new FakeTransport(['/www/es', '/www/es_old']);
  await publishArtifacts(options(transport));
  assert(transport.paths.has('/www/es'));
  assert(transport.paths.has('/www/es_old'));
});

test('no activa ningun idioma hasta completar subidas antes de la finalizacion SSH', async () => {
  const transport = new RemoteFakeTransport();
  await publishArtifacts({
    transport,
    artifacts: [
      { name: 'es', localDirectory: '/local/es' },
      { name: 'en', localDirectory: '/local/en' },
    ],
    remoteDirectory: '/www',
    log() {},
  });
  assert.deepEqual(transport.operations.map(([operation]) => operation), [
    'remove',
    'upload',
    'finalize',
  ]);
  assert.deepEqual(transport.operations[1][1], [
    { localPath: '/local/es', remotePath: '/www/es_new' },
    { localPath: '/local/en', remotePath: '/www/en_new' },
  ]);
});

test('un fallo al normalizar permisos impide la activacion', async () => {
  const transport = new RemoteFakeTransport();
  transport.permissionsFail = true;
  await assert.rejects(publishArtifacts(options(transport)), /chmod failed/u);
  assert.equal(transport.operations.filter(([operation]) => operation === 'finalize').length, 1);
});

test('restaura el activo si falla la activacion', async () => {
  const transport = new FakeTransport(['/www/es']);
  transport.failFor = '/www/es_new';
  await assert.rejects(publishArtifacts(options(transport)), /restauro la version anterior/u);
  assert(transport.paths.has('/www/es'));
});

test('agrupa el error si tambien falla el rollback', async () => {
  const transport = new FakeTransport(['/www/es']);
  transport.failFor = '/www/es_new';
  transport.rollbackFailFor = '/www/es_old';
  await assert.rejects(
    publishArtifacts(options(transport)),
    (error) => error instanceof ActivationRollbackError && error.errors.length === 2,
  );
});
