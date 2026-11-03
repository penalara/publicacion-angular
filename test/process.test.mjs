import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcess } from '../src/process.mjs';

test('interrumpe un proceso bloqueado al agotar el timeout', { timeout: 10000 }, async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200 }),
    (error) => error.code === 'ETIMEDOUT' && error.timeoutMs === 200,
  );
});

test('conserva la salida y el resultado cuando termina antes del timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'console.log("ok"); console.error("detalle")'], { timeoutMs: 10000 });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'ok');
  assert.equal(result.stderr.trim(), 'detalle');
});

test('conserva los errores de salida con timeout configurado', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'console.error("fallo"); process.exit(7)'], { timeoutMs: 10000 }),
    (error) => error.exitCode === 7 && error.message.includes('fallo'),
  );
});
