import { SftpTransport } from './sftp.mjs';

export function createTransport(config, options) {
  return new SftpTransport(config.sftpConfig, undefined, options);
}
