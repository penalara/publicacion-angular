import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareRemoteDeploymentLog } from '../src/deployment-log.mjs';

test('crea un log remoto configurable con version y revision', async () => {
  let contents;
  const renames = [];
  const transport = {
    async fileExists() { return false; },
    async uploadFile(localPath, remotePath) {
      assert.equal(remotePath, '/logs/releases.log_new');
      contents = await readFile(localPath, 'utf8');
    },
    async removeFile() {},
    async renameFile(source, destination) { renames.push([source, destination]); },
  };
  const log = await prepareRemoteDeploymentLog(transport, {
    version: '1.2.3',
    revision: 'abc123',
    remotePath: '/logs/releases.log',
  }, {
    getUsername: () => 'user',
    now: () => new Date(2026, 0, 2, 3, 4, 5),
  });
  try {
    await log.publish();
    assert.equal(contents, '1.2.3 | abc123 | user | 02/01/2026 03:04:05\n');
    assert.deepEqual(renames, [['/logs/releases.log_new', '/logs/releases.log']]);
  } finally {
    await log.cleanup();
  }
});
