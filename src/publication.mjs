import { posix } from 'node:path';
import { ActivationRollbackError } from './errors.mjs';

export async function publishArtifacts({ transport, artifacts, remoteDirectory, log = console.log }) {
  if (transport.removeDirectories && transport.uploadDirectories && transport.normalizeDirectories && transport.activateArtifacts) {
    return publishArtifactsOverSsh({ transport, artifacts, remoteDirectory, log });
  }
  log('Subiendo nuevas versiones...');
  for (const artifact of artifacts) {
    const newPath = posix.join(remoteDirectory, `${artifact.name}_new`);
    if (await transport.exists(newPath)) {
      log(`[${artifact.name}] Eliminando resto anterior: ${artifact.name}_new`);
      await transport.removeDirectory(newPath);
    }
    log(`[${artifact.name}] Subiendo: ${artifact.name}_new`);
    await transport.uploadDirectory(artifact.localDirectory, newPath);
  }
  log('\nActivando versiones...');
  for (const artifact of artifacts) {
    await activateArtifact(transport, remoteDirectory, artifact.name, log);
  }
}

async function publishArtifactsOverSsh({ transport, artifacts, remoteDirectory, log }) {
  const newPaths = artifacts.map(({ name }) => posix.join(remoteDirectory, `${name}_new`));
  await transport.removeDirectories(newPaths);

  log('Subiendo nuevas versiones...');
  for (const { name } of artifacts) log(`[${name}] Subiendo: ${name}_new`);
  await transport.uploadDirectories(artifacts.map(({ name, localDirectory }) => ({
    localPath: localDirectory,
    remotePath: posix.join(remoteDirectory, `${name}_new`),
  })));

  log('\nNormalizando permisos...');
  await transport.normalizeDirectories(newPaths);

  log('\nActivando versiones...');
  await transport.activateArtifacts(artifacts.map(({ name }) => ({
    activePath: posix.join(remoteDirectory, name),
    newPath: posix.join(remoteDirectory, `${name}_new`),
    oldPath: posix.join(remoteDirectory, `${name}_old`),
  })));
}

async function activateArtifact(transport, remoteDirectory, name, log) {
  const activePath = posix.join(remoteDirectory, name);
  const newPath = posix.join(remoteDirectory, `${name}_new`);
  const oldPath = posix.join(remoteDirectory, `${name}_old`);
  if (await transport.exists(oldPath)) await transport.removeDirectory(oldPath);
  const hadActiveVersion = await transport.exists(activePath);
  if (hadActiveVersion) {
    log(`[${name}] ${name} -> ${name}_old`);
    try {
      await transport.rename(activePath, oldPath);
    } catch (backupError) {
      await recoverAmbiguousBackup(transport, name, activePath, oldPath, backupError);
    }
  }
  try {
    log(`[${name}] ${name}_new -> ${name}`);
    await transport.rename(newPath, activePath);
  } catch (activationError) {
    if (!hadActiveVersion) throw activationError;
    try {
      if (await transport.exists(activePath)) await transport.removeDirectory(activePath);
      await transport.rename(oldPath, activePath);
    } catch (rollbackError) {
      throw new ActivationRollbackError(name, activationError, rollbackError);
    }
    throw new Error(`Fallo la activacion de "${name}". Se restauro la version anterior.`, {
      cause: activationError,
    });
  }
}

async function recoverAmbiguousBackup(transport, name, activePath, oldPath, backupError) {
  let activeStillExists;
  try {
    activeStillExists = await transport.exists(activePath);
  } catch (stateError) {
    throw new ActivationRollbackError(name, backupError, stateError);
  }
  if (activeStillExists) throw backupError;
  try {
    if (!(await transport.exists(oldPath))) {
      throw new Error(`No existen "${name}" ni "${name}_old" despues del fallo de respaldo.`);
    }
    await transport.rename(oldPath, activePath);
  } catch (rollbackError) {
    throw new ActivationRollbackError(name, backupError, rollbackError);
  }
  throw new Error(`Fallo el respaldo de "${name}". Se restauro la version activa.`, {
    cause: backupError,
  });
}

export async function deploy({ config, artifacts, transport, log = console.log }) {
  await transport.validatePrerequisites();
  await transport.connect();
  try {
    await publishArtifacts({
      transport,
      artifacts,
      remoteDirectory: config.sftpConfig.remoteDirectory,
      log,
    });
  } finally {
    await transport.disconnect();
  }
}
