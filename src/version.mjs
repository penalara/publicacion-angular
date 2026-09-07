import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import semver from 'semver';
import { ConfigurationError } from './errors.mjs';

export function validateVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^[0-9]/u.test(version) ||
    /\s/u.test(version) ||
    semver.valid(version) === null
  ) {
    throw new ConfigurationError('La version debe cumplir SemVer. Ejemplo: 1.2.3 o 1.2.3-rc.1.');
  }
  return version;
}

export async function readPackageInfo(cwd = process.cwd()) {
  const packagePath = resolve(cwd, 'package.json');
  let contents;
  try {
    contents = await readFile(packagePath, 'utf8');
  } catch (error) {
    throw new ConfigurationError(`No se puede leer package.json: ${packagePath}`, { cause: error });
  }
  let packageJson;
  try {
    packageJson = JSON.parse(contents);
  } catch (error) {
    throw new ConfigurationError(`package.json no contiene JSON valido: ${packagePath}`, { cause: error });
  }
  if (typeof packageJson.name !== 'string' || packageJson.name.trim() === '') {
    throw new ConfigurationError('package.json debe declarar un nombre de paquete.');
  }
  return { packagePath, packageJson, contents, name: packageJson.name, version: validateVersion(packageJson.version) };
}

async function replaceFile(filePath, contents) {
  const temporaryPath = `${filePath}.publicacion-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function preparePackageVersion(version, packageInfo) {
  validateVersion(version);
  const packageJson = { ...packageInfo.packageJson, version };
  const preparedContents = `${JSON.stringify(packageJson, null, 2)}\n`;
  await replaceFile(packageInfo.packagePath, preparedContents);
  let completed = false;
  let restorePromise;
  const removeSignalHandlers = () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
  const restore = async () => {
    if (completed) return;
    restorePromise ??= (async () => {
      const currentContents = await readFile(packageInfo.packagePath, 'utf8');
      if (currentContents !== preparedContents) {
        throw new Error(
          'package.json cambio durante la publicacion; no se restaura para no perder cambios ajenos.',
        );
      }
      await replaceFile(packageInfo.packagePath, packageInfo.contents);
      completed = true;
      removeSignalHandlers();
    })();
    await restorePromise;
  };
  const handleSignal = async (exitCode) => {
    try {
      await restore();
    } catch (error) {
      console.error('ERROR: No se pudo restaurar package.json tras interrumpir la publicacion.');
      console.error(error);
    }
    process.exit(exitCode);
  };
  const onSigint = () => void handleSignal(130);
  const onSigterm = () => void handleSignal(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    preparedContents,
    commit() {
      completed = true;
      removeSignalHandlers();
    },
    restore,
  };
}
