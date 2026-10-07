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

function transportWithCalls(config = {
  sshAlias: 'web-production',
  remoteDirectory: '/www/application',
}) {
  const calls = [];
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  return { calls, transport: new SftpTransport(config, run) };
}

test('SFTP solo conecta y transfiere los artefactos', async () => {
  const { calls, transport } = transportWithCalls();
  await transport.validatePrerequisites();
  await transport.connect();
  await transport.uploadDirectories([
    { localPath: 'C:\\build path\\es', remotePath: '/www/application/es_new' },
    { localPath: 'C:\\build path\\en', remotePath: '/www/application/en_new' },
  ]);

  assert.deepEqual(calls.slice(0, 2).map(({ command, args }) => [command, args]), [
    ['sftp', ['-h']],
    ['ssh', ['-V']],
  ]);
  assert.equal(calls[2].command, 'sftp');
  assert.equal(calls[2].options.input, 'cd "/www/application"\npwd\n');
  assert.equal(calls[3].command, 'sftp');
  assert.equal(
    calls[3].options.input,
    'put -R "C:/build path/es" "/www/application/es_new"\nput -R "C:/build path/en" "/www/application/en_new"\n',
  );
  assert.equal(calls.filter(({ command }) => command === 'sftp').some(({ options }) => /chmod|rename|rm /u.test(options.input)), false);
});

test('SSH elimina, normaliza, activa y restaura en comandos agrupados', async () => {
  const { calls, transport } = transportWithCalls();
  await transport.removeDirectories(['/www/application/es_new', '/www/application/en_new']);
  await transport.normalizeDirectories(['/www/application/es_new', '/www/application/en_new']);
  await transport.activateArtifacts([{
    activePath: '/www/application/es',
    newPath: '/www/application/es_new',
    oldPath: '/www/application/es_old',
  }]);

  assert.equal(calls.length, 3);
  assert(calls.every(({ command, args }) => command === 'ssh' && args[0] === '-T' && args[1] === 'web-production'));
  assert.equal(calls[0].args[2], "rm -rf -- '/www/application/es_new' '/www/application/en_new'");
  assert.match(calls[1].args[2], /find '\/www\/application\/es_new' -type d -exec chmod 2775 \{\} \+/u);
  assert.match(calls[1].args[2], /find '\/www\/application\/en_new' -type f -exec chmod 664 \{\} \+/u);
  assert.match(calls[2].args[2], /rm -rf -- '\/www\/application\/es_old'/u);
  assert.match(calls[2].args[2], /mv -- '\/www\/application\/es' '\/www\/application\/es_old'/u);
  assert.match(calls[2].args[2], /mv -- '\/www\/application\/es_new' '\/www\/application\/es'/u);
  assert.match(calls[2].args[2], /mv -- '\/www\/application\/es_old' '\/www\/application\/es' \|\| exit 1/u);
});

test('SSH escapa rutas remotas con caracteres de shell', async () => {
  const remoteDirectory = "/www/a'; touch injected";
  const { calls, transport } = transportWithCalls({ sshAlias: 'web-production', remoteDirectory });
  await transport.removeDirectories([`${remoteDirectory}/es_new`]);
  assert.equal(calls[0].args[2], "rm -rf -- '/www/a'\"'\"'; touch injected/es_new'");
});

test('un fallo SSH identifica la operacion logica', async () => {
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/www/application',
  }, async (command) => {
    if (command === 'ssh') throw new Error('Permission denied');
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  await assert.rejects(
    transport.normalizeDirectories(['/www/application/es_new']),
    /normalizar permisos/u,
  );
});
