import { posix } from 'node:path';
import { createDebugLogger } from '../logging.mjs';
import { runProcess } from '../process.mjs';

function sftpQuote(value) {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/[\*?\[\]]/gu, '\\$&')}"`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export class SftpTransport {
  #config;
  #run;
  #debug;

  constructor(config, run = runProcess, { log = console.log, debug = false } = {}) {
    this.#config = config;
    this.#run = run;
    this.#debug = createDebugLogger(log, debug);
  }

  async validatePrerequisites() {
    try {
      this.#debug('Validando ejecutable OpenSSH SFTP...');
      const sftp = await this.#run('sftp', ['-h'], { allowedExitCodes: [0, 1], stdio: 'ignore' });
      this.#debug(`OpenSSH SFTP disponible (codigo ${sftp.exitCode}).`);
      this.#debug('Validando ejecutable OpenSSH SSH...');
      const ssh = await this.#run('ssh', ['-V'], { allowedExitCodes: [0, 1], stdio: 'ignore' });
      this.#debug(`OpenSSH SSH disponible (codigo ${ssh.exitCode}).`);
    } catch (error) {
      throw new Error('OpenSSH SSH y SFTP deben estar disponibles en el sistema.', { cause: error });
    }
  }

  async connect() {
    try {
      this.#debug(`SFTP: validando directorio remoto mediante ${this.#config.sshAlias}.`);
      await this.#sftp(`cd ${sftpQuote(this.#config.remoteDirectory)}\npwd`);
    } catch (error) {
      throw new Error(
        `No se ha podido conectar mediante el alias SFTP "${this.#config.sshAlias}" o no existe "${this.#config.remoteDirectory}".`,
        { cause: error },
      );
    }
  }

  async disconnect() {}

  async uploadDirectories(entries) {
    for (const { remotePath } of entries) this.#assertManagedPath(remotePath);
    await this.#sftp(entries.map(({ localPath, remotePath }) => (
      `put -R ${sftpQuote(localPath.replaceAll('\\', '/'))} ${sftpQuote(remotePath)}`
    )));
  }

  async removeDirectories(remotePaths) {
    for (const remotePath of remotePaths) this.#assertManagedPath(remotePath);
    if (remotePaths.length === 0) return;
    await this.#ssh(
      'eliminar directorios de despliegue anteriores',
      `rm -rf -- ${remotePaths.map(shellQuote).join(' ')}`,
    );
  }

  async finalizeArtifacts(entries) {
    for (const { activePath, newPath, oldPath } of entries) {
      this.#assertManagedPath(activePath);
      this.#assertManagedPath(newPath);
      this.#assertManagedPath(oldPath);
    }
    const commands = ['set -e'];
    for (const { newPath } of entries) {
      commands.push(
        `find ${shellQuote(newPath)} -type d -exec chmod 2775 {} +`,
        `find ${shellQuote(newPath)} -type f -exec chmod 664 {} +`,
      );
    }
    commands.push(...entries.map(({ activePath, newPath, oldPath }) => [
      `rm -rf -- ${shellQuote(oldPath)}`,
      `if [ -e ${shellQuote(activePath)} ]; then`,
      `  mv -- ${shellQuote(activePath)} ${shellQuote(oldPath)}`,
      `  if ! mv -- ${shellQuote(newPath)} ${shellQuote(activePath)}; then`,
      `    mv -- ${shellQuote(oldPath)} ${shellQuote(activePath)} || exit 1`,
      '    exit 1',
      '  fi',
      'else',
      `  mv -- ${shellQuote(newPath)} ${shellQuote(activePath)}`,
      'fi',
    ].join('\n')));
    await this.#ssh('normalizar permisos y activar las nuevas versiones', commands.join('\n'));
  }

  async #sftp(commands, allowedExitCodes = [0]) {
    const batch = Array.isArray(commands) ? commands : [commands];
    const result = await this.#run('sftp', ['-b', '-', this.#config.sshAlias], {
      input: `${batch.join('\n')}\n`,
      allowedExitCodes,
    });
    this.#debug(`SFTP: operacion completada (codigo ${result.exitCode}).`);
    return result;
  }

  async #ssh(operation, command) {
    try {
      this.#debug(`SSH: operacion logica: ${operation}.`);
      const result = await this.#run('ssh', ['-T', this.#config.sshAlias, command]);
      this.#debug(`SSH: operacion completada (codigo ${result.exitCode}).`);
    } catch (error) {
      throw new Error(`No se ha podido ${operation} mediante SSH.`, { cause: error });
    }
  }

  #assertManagedPath(remotePath) {
    if (posix.dirname(remotePath) !== this.#config.remoteDirectory) {
      throw new Error(`La operacion SFTP queda fuera del directorio remoto: ${remotePath}`);
    }
  }

}
