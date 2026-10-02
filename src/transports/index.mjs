import { SftpTransport } from './sftp.mjs';

export function createTransport(config) {
  return new SftpTransport({ ...config.sftpConfig, remoteLogPath: config.remoteLogPath });
}
