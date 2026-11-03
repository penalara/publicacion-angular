import { spawn } from 'node:child_process';
import { ProcessError } from './errors.mjs';

export function runProcess(
  command,
  args,
  { cwd, input, allowedExitCodes = [0], stdio = 'pipe', environment = process.env, timeoutMs } = {},
) {
  return new Promise((resolve, reject) => {
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647)) {
      reject(new RangeError('timeoutMs debe ser un entero entre 1 y 2147483647.'));
      return;
    }
    const capture = stdio === 'pipe' && input === undefined;
    const child = spawn(command, args, {
      cwd,
      env: environment,
      shell: false,
      stdio: input === undefined ? stdio : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      const error = new Error(`El comando "${command}" excedio el tiempo limite de ${timeoutMs} ms.`);
      error.code = 'ETIMEDOUT';
      error.timeoutMs = timeoutMs;
      reject(error);
      child.kill('SIGKILL');
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, timeoutMs);
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    } else if (input !== undefined) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      if (allowedExitCodes.includes(exitCode)) {
        resolve({ exitCode, stdout, stderr });
      } else {
        reject(new ProcessError(`${command} ${args.join(' ')}`, exitCode, stderr));
      }
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
