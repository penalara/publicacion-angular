import assert from 'node:assert/strict';
import test from 'node:test';
import { publishArtifacts } from '../src/publication.mjs';
import { FtpTransport } from '../src/transports/ftp.mjs';

class FakeFtpClient {
  operations = [];

  async access(options) { this.operations.push(['access', options]); }
  async cd(path) {
    this.operations.push(['cd', path]);
    if (this.failCd) throw { code: 550 };
  }
  async ensureDir(path) { this.operations.push(['ensureDir', path]); }
  async list(path) {
    this.operations.push(['list', path]);
    return this.listing ?? [{ name: path }];
  }
  async uploadFromDir(localPath, remotePath) { this.operations.push(['uploadFromDir', localPath, remotePath]); }
  async removeDir(path) { this.operations.push(['removeDir', path]); }
  async rename(sourcePath, destinationPath) { this.operations.push(['rename', sourcePath, destinationPath]); }
  async size(path) { this.operations.push(['size', path]); }
  async downloadTo(localPath, remotePath) { this.operations.push(['downloadTo', localPath, remotePath]); }
  async uploadFrom(localPath, remotePath) { this.operations.push(['uploadFrom', localPath, remotePath]); }
  async remove(path) { this.operations.push(['remove', path]); }
  close() {}
}

const config = {
  host: 'ftp.example.com',
  port: 21,
  username: 'user',
  password: 'password',
  remoteDirectory: '/public_html',
};

test('FTP usa el directorio inicial sin volver a la raiz para artefactos', async () => {
  const client = new FakeFtpClient();
  const transport = new FtpTransport(config, client);

  await transport.connect();
  await transport.exists('/public_html/es_new');
  await transport.uploadDirectory('/local/es', '/public_html/es_new');
  await transport.rename('/public_html/es_new', '/public_html/es');
  await transport.removeDirectory('/public_html/es_old');

  assert.deepEqual(client.operations.slice(0, 2), [
    ['access', {
      host: 'ftp.example.com',
      port: 21,
      user: 'user',
      password: 'password',
      secure: false,
    }],
    ['cd', '/public_html'],
  ]);
  assert.deepEqual(client.operations.slice(2), [
    ['list', 'es_new'],
    ['uploadFromDir', '/local/es', 'es_new'],
    ['rename', 'es_new', 'es'],
    ['removeDir', 'es_old'],
  ]);
  assert.equal(client.operations.some(([operation]) => operation === 'ensureDir'), false);
});

test('FTP conserva la creacion del directorio cuando no existe', async () => {
  const client = new FakeFtpClient();
  client.failCd = true;
  const transport = new FtpTransport(config, client);

  await transport.connect();

  assert.deepEqual(client.operations.slice(1), [
    ['cd', '/public_html'],
    ['ensureDir', '/public_html'],
  ]);
});

test('FTP no elimina un directorio temporal cuando LIST responde vacio', async () => {
  const client = new FakeFtpClient();
  client.listing = [];
  const transport = new FtpTransport(config, client);

  await transport.connect();
  await publishArtifacts({
    transport,
    artifacts: [{ name: 'en', localDirectory: '/local/en' }],
    remoteDirectory: '/public_html',
    log() {},
  });

  assert.equal(client.operations.some(([operation]) => operation === 'removeDir'), false);
  assert(client.operations.some(([operation, local, remote]) => (
    operation === 'uploadFromDir' && local === '/local/en' && remote === 'en_new'
  )));
});
