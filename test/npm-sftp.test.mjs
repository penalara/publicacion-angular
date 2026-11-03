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

test('SSH elimina y finaliza permisos, activacion y restauracion en comandos agrupados', async () => {
  const { calls, transport } = transportWithCalls();
  await transport.removeDirectories(['/www/application/es_new', '/www/application/en_new']);
  await transport.finalizeArtifacts([
    {
      activePath: '/www/application/es',
      newPath: '/www/application/es_new',
      oldPath: '/www/application/es_old',
    },
    {
      activePath: '/www/application/en',
      newPath: '/www/application/en_new',
      oldPath: '/www/application/en_old',
    },
  ]);

  assert.equal(calls.length, 2);
  for (const { command, args, options } of calls) {
    assert.equal(command, 'ssh');
    assert.deepEqual(args.slice(0, 3), ['-n', '-T', 'web-production']);
    assert.equal(options.timeoutMs, 300000);
  }
  assert.equal(calls[0].args[3], "rm -rf -- '/www/application/es_new' '/www/application/en_new'");
  assert.match(calls[1].args[3], /find '\/www\/application\/es_new' -type d -exec chmod 2775 \{\} \+/u);
  assert.match(calls[1].args[3], /find '\/www\/application\/en_new' -type f -exec chmod 664 \{\} \+/u);
  assert.match(calls[1].args[3], /rm -rf -- '\/www\/application\/es_old'/u);
  assert.match(calls[1].args[3], /mv -- '\/www\/application\/es' '\/www\/application\/es_old'/u);
  assert.match(calls[1].args[3], /mv -- '\/www\/application\/es_new' '\/www\/application\/es'/u);
  assert.match(calls[1].args[3], /mv -- '\/www\/application\/es_old' '\/www\/application\/es' \|\| exit 1/u);
});

test('SSH escapa rutas remotas con caracteres de shell', async () => {
  const remoteDirectory = "/www/a'; touch injected";
  const { calls, transport } = transportWithCalls({ sshAlias: 'web-production', remoteDirectory });
  await transport.removeDirectories([`${remoteDirectory}/es_new`]);
  assert.equal(calls[0].args[3], "rm -rf -- '/www/a'\"'\"'; touch injected/es_new'");
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
    transport.finalizeArtifacts([{
      activePath: '/www/application/es',
      newPath: '/www/application/es_new',
      oldPath: '/www/application/es_old',
    }]),
    /normalizar permisos y activar/u,
  );
});

test('el timeout SSH personalizado identifica la operacion y conserva la causa', async () => {
  const timeoutError = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', timeoutMs: 1234 });
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/www/application',
    sshTimeoutMs: 1234,
  }, async (command, args, options) => {
    assert.equal(options.timeoutMs, 1234);
    throw timeoutError;
  });
  await assert.rejects(transport.removeDirectories(['/www/application/es_new']), (error) => {
    assert.match(error.message, /1234 ms.*eliminar directorios/u);
    assert.equal(error.cause, timeoutError);
    return true;
  });
});

test('debug muestra comandos logicos y codigos de salida sin el script remoto', async () => {
  const logs = [];
  const transport = new SftpTransport({
    sshAlias: 'web-production',
    remoteDirectory: '/www/application',
  }, async () => ({ exitCode: 0, stdout: '', stderr: '' }), { log: (message) => logs.push(message), debug: true });
  await transport.validatePrerequisites();
  await transport.removeDirectories(['/www/application/es_new']);
  assert(logs.includes('[debug] Validando ejecutable OpenSSH SFTP...'));
  assert(logs.includes('[debug] OpenSSH SSH disponible (codigo 0).'));
  assert(logs.includes('[debug] SSH: operacion logica: eliminar directorios de despliegue anteriores.'));
  assert.equal(logs.some((message) => message.includes('rm -rf')), false);
});
