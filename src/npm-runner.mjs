import { spawn } from 'node:child_process';

export function resolveNpmInvocation(environment = process.env, nodeExecutable = process.execPath) {
  const npmCliPath = environment.npm_execpath;
  if (!npmCliPath) {
    throw new Error(
      'No se puede localizar el CLI de npm. Ejecute la publicacion mediante npm run publicar:<entorno>.',
    );
  }
  return {
    command: environment.npm_node_execpath || nodeExecutable,
    args: [npmCliPath],
  };
}

export function runNpmScript(scriptName, { cwd = process.cwd(), environment = process.env } = {}) {
  const npmInvocation = resolveNpmInvocation(environment);
  return new Promise((resolve, reject) => {
    const child = spawn(
      npmInvocation.command,
      [...npmInvocation.args, 'run', scriptName],
      { cwd, env: environment, shell: false, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('close', (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`El build "npm run ${scriptName}" termino con codigo ${exitCode}.`));
    });
  });
}
