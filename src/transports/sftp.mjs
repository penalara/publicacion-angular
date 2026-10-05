import { posix } from 'node:path';
import { runProcess } from '../process.mjs';

function sftpQuote(value) {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/[\*?\[\]]/gu, '\\$&')}"`;
}

function parseListing(stdout, directory) {
  const prefix = `${directory}/`;
  return stdout
    .split(/\r?\n/u)
    .map((rawEntry) => {
      const entry = rawEntry.startsWith(prefix) ? rawEntry.slice(prefix.length) : rawEntry;
      if (
        entry !== ''
        && entry !== '.'
        && entry !== '..'
        && (/^[\r\n\0]/u.test(entry) || posix.basename(entry) !== entry)
      ) {
        throw new Error(`El servidor SFTP ha devuelto un nombre de fichero no valido: ${JSON.stringify(rawEntry)}`);
      }
      return entry;
    })
    .filter((entry) => entry !== '' && entry !== '.' && entry !== '..');
}

export class SftpTransport {
  #config;
  #run;

  constructor(config, run = runProcess) {
    this.#config = config;
    this.#run = run;
  }

  async validatePrerequisites() {
    try {
      await this.#run('sftp', ['-h'], { allowedExitCodes: [0, 1], stdio: 'ignore' });
    } catch (error) {
      throw new Error('OpenSSH SFTP no esta disponible en el sistema.', { cause: error });
    }
  }

  async connect() {
    try {
      await this.#sftp(`@ls ${sftpQuote(this.#config.remoteDirectory)}`);
    } catch (error) {
      throw new Error(
        `No se ha podido conectar mediante el alias SFTP "${this.#config.sshAlias}" o no existe "${this.#config.remoteDirectory}".`,
        { cause: error },
      );
    }
  }

  async disconnect() {}

  async exists(remotePath) {
    this.#assertManagedPath(remotePath);
    return this.#exists(remotePath);
  }

  async uploadDirectory(localPath, remotePath) {
    this.#assertManagedPath(remotePath);
    await this.#sftp(`put -pR ${sftpQuote(localPath.replaceAll('\\', '/'))} ${sftpQuote(remotePath)}`);
  }

  async removeDirectory(remotePath) {
    this.#assertManagedPath(remotePath);
    await this.#removeDirectory(remotePath);
  }

  async rename(sourcePath, destinationPath) {
    this.#assertManagedPath(sourcePath);
    this.#assertManagedPath(destinationPath);
    await this.#sftp(`rename ${sftpQuote(sourcePath)} ${sftpQuote(destinationPath)}`);
  }

  async #exists(remotePath) {
    const result = await this.#sftp(`@ls ${sftpQuote(remotePath)}`, [0, 1]);
    return result.exitCode === 0;
  }

  async #removeDirectory(remotePath) {
    const entries = await this.#listDirectory(remotePath);
    for (const entry of entries) {
      const childPath = posix.join(remotePath, entry);
      const result = await this.#sftp(`rm ${sftpQuote(childPath)}`, [0, 1]);
      if (result.exitCode !== 0) await this.#removeDirectory(childPath);
    }
    await this.#sftp(`rmdir ${sftpQuote(remotePath)}`);
  }

  async #listDirectory(remotePath) {
    const result = await this.#sftp(`@ls -1a ${sftpQuote(remotePath)}`);
    return parseListing(result.stdout, remotePath);
  }

  async #sftp(command, allowedExitCodes = [0]) {
    return this.#run('sftp', ['-b', '-', this.#config.sshAlias], {
      input: `${command}\n`,
      allowedExitCodes,
    });
  }

  #assertManagedPath(remotePath) {
    if (posix.dirname(remotePath) !== this.#config.remoteDirectory) {
      throw new Error(`La operacion SFTP queda fuera del directorio remoto: ${remotePath}`);
    }
  }

}
