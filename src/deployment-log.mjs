import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import { DeploymentLogRollbackError } from './errors.mjs';

export function getOperatingSystemUsername() {
  try {
    const username = userInfo().username.trim();
    if (username !== '') return username;
  } catch {
    // The home directory fallback remains available in restricted environments.
  }
  return basename(homedir());
}

export function formatDeploymentDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeAuditField(value) {
  return String(value).replace(/[\r\n|]/gu, '_');
}

export async function prepareRemoteDeploymentLog(
  transport,
  { version, revision, remotePath },
  { getUsername = getOperatingSystemUsername, now = () => new Date() } = {},
) {
  const remoteNew = `${remotePath}_new`;
  const remoteOld = `${remotePath}_old`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'angular-publicacion-'));
  const localLogPath = join(temporaryDirectory, 'despliegues-automaticos.log');
  try {
    let existingContents = '';
    if (await transport.fileExists(remotePath)) {
      await transport.downloadFile(remotePath, localLogPath);
      existingContents = await readFile(localLogPath, 'utf8');
    }
    const separator = existingContents !== '' && !existingContents.endsWith('\n') ? '\n' : '';
    const line = `${version} | ${normalizeAuditField(revision)} | ${normalizeAuditField(getUsername())} | ${formatDeploymentDate(now())}`;
    await writeFile(localLogPath, `${existingContents}${separator}${line}\n`, 'utf8');
    return {
      line,
      async publish() {
        if (await transport.fileExists(remoteNew)) await transport.removeFile(remoteNew);
        await transport.uploadFile(localLogPath, remoteNew);
        if (await transport.fileExists(remoteOld)) await transport.removeFile(remoteOld);
        const hadPreviousLog = await transport.fileExists(remotePath);
        if (hadPreviousLog) {
          try {
            await transport.renameFile(remotePath, remoteOld);
          } catch (backupError) {
            await recoverAmbiguousBackup(transport, remotePath, remoteOld, backupError);
          }
        }
        try {
          await transport.renameFile(remoteNew, remotePath);
        } catch (publicationError) {
          if (!hadPreviousLog) throw publicationError;
          try {
            await transport.renameFile(remoteOld, remotePath);
          } catch (rollbackError) {
            throw new DeploymentLogRollbackError(publicationError, rollbackError);
          }
          throw new Error('Fallo la actualizacion del log remoto. Se restauro su version anterior.', {
            cause: publicationError,
          });
        }
      },
      async cleanup() { await rm(temporaryDirectory, { recursive: true, force: true }); },
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function recoverAmbiguousBackup(transport, remotePath, remoteOld, backupError) {
  if (await transport.fileExists(remotePath)) throw backupError;
  try {
    if (!(await transport.fileExists(remoteOld))) {
      throw new Error('No existen el log activo ni su copia anterior despues del fallo de respaldo.');
    }
    await transport.renameFile(remoteOld, remotePath);
  } catch (rollbackError) {
    throw new DeploymentLogRollbackError(backupError, rollbackError);
  }
  throw new Error('Fallo el respaldo del log remoto. Se restauro el log activo.', { cause: backupError });
}
