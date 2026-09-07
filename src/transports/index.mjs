import { FtpTransport } from './ftp.mjs';
import { SftpTransport } from './sftp.mjs';

export function createTransport(config) {
  const transportConfig = { ...config.transport, remoteLogPath: config.remoteLogPath };
  return config.transport.type === 'FTP'
    ? new FtpTransport(transportConfig)
    : new SftpTransport(transportConfig);
}
