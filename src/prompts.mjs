import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import semver from 'semver';
import { ConfigurationError } from './errors.mjs';
import { validateVersion } from './version.mjs';

export function isInteractive(input = stdin, output = stdout) {
  return input.isTTY === true && output.isTTY === true;
}

export async function askVersion(currentVersion, { input = stdin, output = stdout } = {}) {
  if (!isInteractive(input, output)) {
    throw new ConfigurationError(
      'Falta la version. En una ejecucion no interactiva debe indicarla junto con --new-version.',
    );
  }
  const suggestedVersion = semver.inc(validateVersion(currentVersion), 'patch');
  const readline = createInterface({ input, output });
  try {
    while (true) {
      const answer = await readline.question(
        `Version actual ${currentVersion}. Indique la siguiente version (${suggestedVersion}): `,
      );
      const version = answer.trim() || suggestedVersion;
      try {
        return validateVersion(version);
      } catch (error) {
        output.write(`${error.message}\n`);
      }
    }
  } finally {
    readline.close();
  }
}

export async function confirm(question, { input = stdin, output = stdout } = {}) {
  if (!isInteractive(input, output)) return false;
  const readline = createInterface({ input, output });
  try {
    const answer = (await readline.question(`${question} [s/N]: `)).trim().toLowerCase();
    return answer === 's' || answer === 'si' || answer === 'sí' || answer === 'y' || answer === 'yes';
  } finally {
    readline.close();
  }
}
