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
    await this.#client.ensureDir(this.#config.remoteDirectory);
  }

  disconnect() { this.#client.close(); }

  async exists(remotePath) {
    try {
      await this.#client.list(remotePath);
      return true;
    } catch (error) {
      if (error instanceof FTPError && error.code === 550) return false;
      throw error;
    }
  }

  async uploadDirectory(localPath, remotePath) { await this.#client.uploadFromDir(localPath, remotePath); }
  async removeDirectory(remotePath) { await this.#client.removeDir(remotePath); }
  async rename(sourcePath, destinationPath) { await this.#client.rename(sourcePath, destinationPath); }

  async fileExists(remotePath) {
    try {
      await this.#client.size(remotePath);
      return true;
    } catch (error) {
      if (error instanceof FTPError && error.code === 550) return false;
      throw error;
    }
  }

  async downloadFile(remotePath, localPath) { await this.#client.downloadTo(localPath, remotePath); }
  async uploadFile(localPath, remotePath) { await this.#client.uploadFrom(localPath, remotePath); }
  async removeFile(remotePath) { await this.#client.remove(remotePath); }
  async renameFile(sourcePath, destinationPath) { await this.#client.rename(sourcePath, destinationPath); }
}
