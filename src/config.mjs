import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, posix, resolve } from 'node:path';
import { ConfigurationError } from './errors.mjs';

export const CONFIG_RELATIVE_PATH = 'tools/publicacion/publicacion.config.json';
export const CREDENTIALS_PATH = resolve(homedir(), '.npm', 'publicacion.credenciales.json');

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

async function loadFtpCredentials(project, environment, credentialsPath) {
  const allCredentials = requireObject(
    await readJson(credentialsPath, 'el fichero de credenciales FTP'),
    'El fichero de credenciales FTP',
  );
  const projectCredentials = requireObject(
    allCredentials[project],
    `Las credenciales FTP del proyecto "${project}"`,
  );
  const credentials = requireObject(
    projectCredentials[environment],
    `Las credenciales FTP del entorno "${environment}" del proyecto "${project}"`,
  );
  const label = `las credenciales de "${project}/${environment}"`;
  const username = requireString(credentials, 'username', label);
  const password = requireString(credentials, 'password', label, { preserveWhitespace: true });
  if (username.startsWith('USUARIO_FTP_') || password.startsWith('PASSWORD_FTP_')) {
    throw new ConfigurationError(`${label} todavia contiene valores de ejemplo.`);
  }
  return { username, password };
}

export async function loadPublicationConfig(
  project,
  environment,
  {
    cwd = process.cwd(),
    configPath = resolve(cwd, CONFIG_RELATIVE_PATH),
    credentialsPath = CREDENTIALS_PATH,
  } = {},
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(project)) {
    throw new ConfigurationError(`Identificador de proyecto no valido: "${project}".`);
  }
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

  const logConfig = root.deploymentLog === undefined
    ? {}
    : requireObject(root.deploymentLog, 'La propiedad "deploymentLog"');
  const configuredLogPath = logConfig.remotePath === undefined
    ? '/despliegues-automaticos.log'
    : requireString(logConfig, 'remotePath', 'la configuracion del log');
  const remoteLogPath = validateRemotePath(
    configuredLogPath,
    'deploymentLog.remotePath',
  );

  const releaseConfig = root.release === undefined
    ? {}
    : requireObject(root.release, 'La propiedad "release"');
  const tagPrefix = optionalTagPrefix(releaseConfig);

  const transport = requireObject(environmentConfig.transport, `El transporte de ${label}`);
  const transportType = requireString(transport, 'type', `el transporte de ${label}`).toUpperCase();
  const remoteDirectory = validateRemotePath(
    requireString(transport, 'remoteDirectory', `el transporte de ${label}`),
    'transport.remoteDirectory',
  );
  let normalizedTransport;
  if (transportType === 'FTP') {
    const host = requireString(transport, 'host', `el transporte de ${label}`);
    if (!Number.isInteger(transport.port) || transport.port < 1 || transport.port > 65535) {
      throw new ConfigurationError(`transport.port de ${label} debe ser un entero entre 1 y 65535.`);
    }
    normalizedTransport = {
      type: transportType,
      host,
      port: transport.port,
      remoteDirectory,
      ...await loadFtpCredentials(project, environment, credentialsPath),
    };
  } else if (transportType === 'SFTP') {
    const sshAlias = requireString(transport, 'sshAlias', `el transporte de ${label}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(sshAlias)) {
      throw new ConfigurationError(`transport.sshAlias de ${label} contiene caracteres no admitidos.`);
    }
    normalizedTransport = { type: transportType, sshAlias, remoteDirectory };
  } else {
    throw new ConfigurationError(`Transporte desconocido "${transport.type}" en ${label}.`);
  }

  return {
    project,
    environment,
    name,
    buildScript,
    artifactPathPattern,
    requiredFile: requiredFile.replaceAll('\\', '/'),
    publicationBranch,
    versionBranch,
    vcs: { type: vcsType, remote: vcsRemote },
    remoteLogPath,
    tagPrefix,
    transport: normalizedTransport,
  };
}
