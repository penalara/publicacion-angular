import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNpmInvocation } from '../src/npm-runner.mjs';
import { SftpTransport } from '../src/transports/sftp.mjs';

test('resuelve npm mediante su CLI JavaScript en Windows', () => {
  assert.deepEqual(resolveNpmInvocation({
    npm_execpath: 'C:\\Program Files\\npm\\npm-cli.js',
    npm_node_execpath: 'C:\\Program Files\\nodejs\\node.exe',
  }), {
    command: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\Program Files\\npm\\npm-cli.js'],
  });
});

test('SFTP usa OpenSSH y rutas configurables de log', async () => {
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/www/application',
    remoteLogPath: '/logs/deployment.log',
  }, run);
  await transport.validatePrerequisites();
  await transport.connect();
  await transport.uploadDirectory('C:\\build path\\es', '/www/application/es_new');
  await transport.fileExists('/logs/deployment.log');
  assert(calls.some(({ command }) => command === 'ssh'));
  assert(calls.some(({ command, options }) =>
    command === 'sftp' && options.input?.includes('C:/build path/es'),
  ));
});
