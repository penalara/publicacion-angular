import { spawn } from 'node:child_process';
import { ProcessError } from './errors.mjs';

export function runProcess(
  command,
  args,
  { cwd, input, allowedExitCodes = [0], stdio = 'pipe', environment = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const capture = stdio === 'pipe' && input === undefined;
    const child = spawn(command, args, {
      cwd,
      env: environment,
      shell: false,
      stdio: input === undefined ? stdio : ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
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
    child.once('error', reject);
    child.once('close', (exitCode) => {
      if (allowedExitCodes.includes(exitCode)) {
        resolve({ exitCode, stdout, stderr });
      } else {
        reject(new ProcessError(`${command} ${args.join(' ')}`, exitCode, stderr));
      }
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
