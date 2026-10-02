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

test('SFTP usa solo comandos SFTP y rutas configurables de log', async () => {
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
  assert.equal(calls.some(({ command }) => command === 'ssh'), false);
  assert(calls.some(({ command, options }) =>
    command === 'sftp' && options.input?.includes('C:/build path/es'),
  ));
  assert(calls.some(({ options }) => options.input === '@ls "/www/application"\n'));
});

test('SFTP elimina directorios de forma recursiva', async () => {
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    const input = options.input;
    if (input === '@ls -1a "/www/application/es_new"\n') {
      return { exitCode: 0, stdout: '.\n..\nmain.js\nassets\n', stderr: '' };
    }
    if (input === '@ls -1a "/www/application/es_new/assets"\n') {
      return { exitCode: 0, stdout: 'logo.svg\n', stderr: '' };
    }
    if (input === 'rm "/www/application/es_new/assets"\n') {
      return { exitCode: 1, stdout: '', stderr: 'not a file' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/www/application',
    remoteLogPath: '/logs/deployment.log',
  }, run);

  await transport.removeDirectory('/www/application/es_new');

  assert.deepEqual(calls.map(({ command, options }) => [command, options.input]), [
    ['sftp', '@ls -1a "/www/application/es_new"\n'],
    ['sftp', 'rm "/www/application/es_new/main.js"\n'],
    ['sftp', 'rm "/www/application/es_new/assets"\n'],
    ['sftp', '@ls -1a "/www/application/es_new/assets"\n'],
    ['sftp', 'rm "/www/application/es_new/assets/logo.svg"\n'],
    ['sftp', 'rmdir "/www/application/es_new/assets"\n'],
    ['sftp', 'rmdir "/www/application/es_new"\n'],
  ]);
});

test('SFTP acepta listados con rutas completas', async () => {
  const remoteDirectory = '/ghcmppruebas/public_html/en_old';
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (options.input === `@ls -1a "${remoteDirectory}"\n`) {
      return {
        exitCode: 0,
        stdout: `${remoteDirectory}/.\n${remoteDirectory}/..\n${remoteDirectory}/index.html\n`,
        stderr: '',
      };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/ghcmppruebas/public_html',
    remoteLogPath: '/logs/deployment.log',
  }, run);

  await transport.removeDirectory(remoteDirectory);

  assert.deepEqual(calls.map(({ options }) => options.input), [
    `@ls -1a "${remoteDirectory}"\n`,
    `rm "${remoteDirectory}/index.html"\n`,
    `rmdir "${remoteDirectory}"\n`,
  ]);
});
