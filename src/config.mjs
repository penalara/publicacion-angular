import { readFile } from 'node:fs/promises';
import { isAbsolute, posix, resolve } from 'node:path';
import { ConfigurationError } from './errors.mjs';

export const CONFIG_RELATIVE_PATH = 'tools/publicacion/publicacion.config.json';

async function readJson(filePath, description) {
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ConfigurationError(`No existe ${description}: ${filePath}`, { cause: error });
    }
    throw new ConfigurationError(`No se puede leer ${description}: ${filePath}`, { cause: error });
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new ConfigurationError(`${description} no contiene JSON valido: ${filePath}`, { cause: error });
  }
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigurationError(`${label} debe ser un objeto JSON.`);
  }
  return value;
}

function requireString(object, property, label, { preserveWhitespace = false } = {}) {
  const value = object[property];
  const normalized = preserveWhitespace ? value : value?.trim();
  if (typeof value !== 'string' || normalized.trim() === '') {
    throw new ConfigurationError(`Falta la propiedad "${property}" en ${label}.`);
  }
  if (/[\r\n\0]/u.test(normalized)) {
    throw new ConfigurationError(`La propiedad "${property}" de ${label} contiene caracteres no admitidos.`);
  }
  if (normalized.startsWith('REEMPLAZAR_')) {
    throw new ConfigurationError(`La propiedad "${property}" de ${label} contiene un valor de ejemplo.`);
  }
  return normalized;
}

function validateRemotePath(value, label) {
  if (!value.startsWith('/') || value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new ConfigurationError(`${label} debe ser una ruta remota absoluta sin "." ni "..".`);
  }
  return posix.normalize(value).replace(/\/+$/u, '') || '/';
}

function optionalTagPrefix(config) {
  if (config.tagPrefix === undefined) return undefined;
  const tagPrefix = requireString(config, 'tagPrefix', 'la configuracion de release');
  if (!/^[A-Za-z0-9@][A-Za-z0-9._@/-]*$/u.test(tagPrefix) || tagPrefix.includes('..') || tagPrefix.endsWith('/')) {
    throw new ConfigurationError('release.tagPrefix no es un prefijo de tag valido.');
  }
  return tagPrefix;
}

function optionalBranch(config, property, label) {
  if (config[property] === undefined) return undefined;
  const branch = requireString(config, property, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(branch) || branch.includes('..')) {
    throw new ConfigurationError(`La propiedad "${property}" de ${label} no es un nombre de rama seguro.`);
  }
  return branch;
}

function validateArtifactPattern(pattern, label) {
  const normalized = pattern.replaceAll('\\', '/');
  if (isAbsolute(normalized) || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new ConfigurationError(`artifactPathPattern de ${label} debe ser una ruta relativa segura.`);
  }
  if (!normalized.includes('{language}')) {
    throw new ConfigurationError(`artifactPathPattern de ${label} debe contener {language}.`);
  }
  return normalized;
}

export async function loadPublicationConfig(
  environment,
  {
    cwd = process.cwd(),
    configPath = resolve(cwd, CONFIG_RELATIVE_PATH),
  } = {},
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(environment)) {
    throw new ConfigurationError(`Entorno de publicacion no valido: "${environment}".`);
  }

  const root = requireObject(
    await readJson(configPath, 'la configuracion de publicacion'),
    'La configuracion de publicacion',
  );
  const environments = requireObject(root.environments, 'La propiedad "environments"');
  const environmentConfig = requireObject(
    environments[environment],
    `La configuracion del entorno "${environment}"`,
  );
  const label = `el entorno "${environment}"`;
  const name = requireString(environmentConfig, 'name', label);
  const buildScript = requireString(environmentConfig, 'buildScript', label);
  const artifactPathPattern = validateArtifactPattern(
    requireString(environmentConfig, 'artifactPathPattern', label),
    label,
  );
  const requiredFile = requireString(environmentConfig, 'requiredFile', label);
  if (isAbsolute(requiredFile) || requiredFile.replaceAll('\\', '/').split('/').includes('..')) {
    throw new ConfigurationError(`requiredFile de ${label} debe ser una ruta relativa segura.`);
  }
  const publicationBranch = optionalBranch(environmentConfig, 'publicationBranch', label);
  const versionBranch = optionalBranch(environmentConfig, 'versionBranch', label);
  if (versionBranch && !publicationBranch) {
    throw new ConfigurationError(`versionBranch de ${label} requiere publicationBranch.`);
  }
  if (versionBranch && versionBranch === publicationBranch) {
    throw new ConfigurationError(`versionBranch y publicationBranch de ${label} deben ser diferentes.`);
  }

  const vcsConfig = root.vcs === undefined ? {} : requireObject(root.vcs, 'La propiedad "vcs"');
  const vcsType = vcsConfig.type === undefined
    ? 'auto'
    : requireString(vcsConfig, 'type', 'la configuracion de VCS').toLowerCase();
  if (!['auto', 'git', 'mercurial'].includes(vcsType)) {
    throw new ConfigurationError('vcs.type debe ser "auto", "git" o "mercurial".');
  }
  const vcsRemote = vcsConfig.remote === undefined
    ? undefined
    : requireString(vcsConfig, 'remote', 'la configuracion de VCS');

  if (root.deploymentLog !== undefined) {
    throw new ConfigurationError('La propiedad "deploymentLog" ya no se admite.');
  }

  const releaseConfig = root.release === undefined
    ? {}
    : requireObject(root.release, 'La propiedad "release"');
  const tagPrefix = optionalTagPrefix(releaseConfig);

  if (environmentConfig.transport !== undefined) {
    throw new ConfigurationError(`La propiedad "transport" de ${label} ya no se admite. Use "sftpConfig".`);
  }
  const sftpConfig = requireObject(environmentConfig.sftpConfig, `La configuracion SFTP de ${label}`);
  const remoteDirectory = validateRemotePath(
    requireString(sftpConfig, 'remoteDirectory', `la configuracion SFTP de ${label}`),
    'sftpConfig.remoteDirectory',
  );
  const sshAlias = requireString(sftpConfig, 'sshAlias', `la configuracion SFTP de ${label}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(sshAlias)) {
    throw new ConfigurationError(`sftpConfig.sshAlias de ${label} contiene caracteres no admitidos.`);
  }

  return {
    environment,
    name,
    buildScript,
    artifactPathPattern,
    requiredFile: requiredFile.replaceAll('\\', '/'),
    publicationBranch,
    versionBranch,
    vcs: { type: vcsType, remote: vcsRemote },
    tagPrefix,
    sftpConfig: { sshAlias, remoteDirectory },
  };
}
