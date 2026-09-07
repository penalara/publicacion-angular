import { posix } from 'node:path';
import { runProcess } from '../process.mjs';

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function sftpQuote(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
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
      await this.#run('ssh', ['-V'], { stdio: 'ignore' });
      await this.#run('sftp', ['-h'], { allowedExitCodes: [0, 1], stdio: 'ignore' });
    } catch (error) {
      throw new Error('OpenSSH (ssh y sftp) no esta disponible en el sistema.', { cause: error });
    }
  }

  async connect() {
    try {
      await this.#ssh(`test -d ${shellQuote(this.#config.remoteDirectory)}`);
    } catch (error) {
      throw new Error(
        `No se ha podido conectar mediante el alias SSH "${this.#config.sshAlias}" o no existe "${this.#config.remoteDirectory}".`,
        { cause: error },
      );
    }
  }

  disconnect() {}

  async exists(remotePath) {
    this.#assertManagedPath(remotePath);
    return (await this.#ssh(`test -e ${shellQuote(remotePath)}`, [0, 1])).exitCode === 0;
  }

  async uploadDirectory(localPath, remotePath) {
    this.#assertManagedPath(remotePath);
    const command = `put -pR ${sftpQuote(localPath.replaceAll('\\', '/'))} ${sftpQuote(remotePath)}\n`;
    await this.#run('sftp', ['-b', '-', this.#config.sshAlias], { input: command });
  }

  async removeDirectory(remotePath) {
    this.#assertManagedPath(remotePath);
    await this.#ssh(`rm -rf -- ${shellQuote(remotePath)}`);
  }

  async rename(sourcePath, destinationPath) {
    this.#assertManagedPath(sourcePath);
    this.#assertManagedPath(destinationPath);
    await this.#ssh(`mv -- ${shellQuote(sourcePath)} ${shellQuote(destinationPath)}`);
  }

  async fileExists(remotePath) {
    this.#assertLogPath(remotePath);
    return (await this.#ssh(`test -f ${shellQuote(remotePath)}`, [0, 1])).exitCode === 0;
  }

  async downloadFile(remotePath, localPath) {
    this.#assertLogPath(remotePath);
    const command = `get -p ${sftpQuote(remotePath)} ${sftpQuote(localPath.replaceAll('\\', '/'))}\n`;
    await this.#run('sftp', ['-b', '-', this.#config.sshAlias], { input: command });
  }

  async uploadFile(localPath, remotePath) {
    this.#assertLogPath(remotePath);
    const command = `put -p ${sftpQuote(localPath.replaceAll('\\', '/'))} ${sftpQuote(remotePath)}\n`;
    await this.#run('sftp', ['-b', '-', this.#config.sshAlias], { input: command });
  }

  async removeFile(remotePath) {
    this.#assertLogPath(remotePath);
    await this.#ssh(`rm -f -- ${shellQuote(remotePath)}`);
  }

  async renameFile(sourcePath, destinationPath) {
    this.#assertLogPath(sourcePath);
    this.#assertLogPath(destinationPath);
    await this.#ssh(`mv -- ${shellQuote(sourcePath)} ${shellQuote(destinationPath)}`);
  }

  async #ssh(remoteCommand, allowedExitCodes = [0]) {
    return this.#run('ssh', [this.#config.sshAlias, remoteCommand], { allowedExitCodes });
  }

  #assertManagedPath(remotePath) {
    if (posix.dirname(remotePath) !== this.#config.remoteDirectory) {
      throw new Error(`La operacion SFTP queda fuera del directorio remoto: ${remotePath}`);
    }
  }

  #assertLogPath(remotePath) {
    const allowed = new Set([
      this.#config.remoteLogPath,
      `${this.#config.remoteLogPath}_new`,
      `${this.#config.remoteLogPath}_old`,
    ]);
    if (!allowed.has(remotePath)) throw new Error(`Ruta de log remoto no permitida: ${remotePath}`);
  }
}
