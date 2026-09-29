import { Client, FTPError } from 'basic-ftp';

export class FtpTransport {
  #client;
  #config;

  constructor(config, client = new Client()) {
    this.#config = config;
    this.#client = client;
  }

  async validatePrerequisites() {}

  async connect() {
    await this.#client.access({
      host: this.#config.host,
      port: this.#config.port,
      user: this.#config.username,
      password: this.#config.password,
      secure: false,
    });
    if (this.#config.remoteDirectory === '/') return;
    try {
      await this.#client.cd(this.#config.remoteDirectory);
    } catch (error) {
      if (error?.code !== 550) throw error;
      await this.#client.ensureDir(this.#config.remoteDirectory);
    }
  }

  disconnect() { this.#client.close(); }

  async exists(remotePath) {
    try {
      await this.#client.list(this.#relativePath(remotePath));
      return true;
    } catch (error) {
      if (error instanceof FTPError && error.code === 550) return false;
      throw error;
    }
  }

  async uploadDirectory(localPath, remotePath) {
    await this.#client.uploadFromDir(localPath, this.#relativePath(remotePath));
  }

  async removeDirectory(remotePath) { await this.#client.removeDir(this.#relativePath(remotePath)); }

  async rename(sourcePath, destinationPath) {
    await this.#client.rename(this.#relativePath(sourcePath), this.#relativePath(destinationPath));
  }

  async fileExists(remotePath) {
    try {
      await this.#client.size(this.#relativePath(remotePath));
      return true;
    } catch (error) {
      if (error instanceof FTPError && error.code === 550) return false;
      throw error;
    }
  }

  async downloadFile(remotePath, localPath) {
    await this.#client.downloadTo(localPath, this.#relativePath(remotePath));
  }

  async uploadFile(localPath, remotePath) {
    await this.#client.uploadFrom(localPath, this.#relativePath(remotePath));
  }

  async removeFile(remotePath) { await this.#client.remove(this.#relativePath(remotePath)); }

  async renameFile(sourcePath, destinationPath) {
    await this.#client.rename(this.#relativePath(sourcePath), this.#relativePath(destinationPath));
  }

  #relativePath(remotePath) {
    if (this.#config.remoteDirectory === '/') return remotePath.slice(1);
    const prefix = `${this.#config.remoteDirectory}/`;
    return remotePath.startsWith(prefix) ? remotePath.slice(prefix.length) : remotePath;
  }
}
