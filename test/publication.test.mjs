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

class BatchedFakeTransport extends FakeTransport {
  async inspectDirectories(paths) {
    this.operations.push(['inspect', paths]);
    return new Map(paths.map((path) => [path, this.paths.has(path)]));
  }

  async uploadDirectories(entries) {
    this.operations.push(['upload-many', entries]);
    for (const { localPath, remotePath } of entries) await this.uploadDirectory(localPath, remotePath);
  }

  async renameMany(entries) {
    this.operations.push(['rename-many', entries]);
    for (const { sourcePath, destinationPath } of entries) await this.rename(sourcePath, destinationPath);
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

test('agrupa inspeccion, subida y activacion cuando el transporte lo permite', async () => {
  const transport = new BatchedFakeTransport(['/www/es']);
  await publishArtifacts(options(transport));
  assert.deepEqual(transport.operations.map(([operation]) => operation), [
    'inspect',
    'upload-many',
    'upload',
    'rename-many',
    'rename',
    'rename',
  ]);
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
