import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

const LANGUAGE_TOKEN = '{language}';
const SAFE_LANGUAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function segmentPattern(segment) {
  const parts = segment.split(LANGUAGE_TOKEN);
  return new RegExp(`^${parts.map(escapeRegex).join('([A-Za-z0-9][A-Za-z0-9._-]*)')}$`, 'u');
}

export async function detectArtifacts(
  artifactPathPattern,
  requiredFile,
  { cwd = process.cwd() } = {},
) {
  const segments = artifactPathPattern.split('/');
  const variableIndex = segments.findIndex((segment) => segment.includes(LANGUAGE_TOKEN));
  const searchRoot = resolve(cwd, ...segments.slice(0, variableIndex));
  let entries;
  try {
    entries = await readdir(searchRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`No existe el directorio generado: ${searchRoot}`, { cause: error });
    }
    throw error;
  }

  const matcher = segmentPattern(segments[variableIndex]);
  const artifacts = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = matcher.exec(entry.name);
    if (!match) continue;
    const captures = match.slice(1);
    const language = captures[0];
    if (!SAFE_LANGUAGE.test(language) || /_(new|old)$/iu.test(language)) continue;
    if (captures.some((capture) => capture !== language)) continue;
    const resolvedSegments = segments.map((segment) => segment.replaceAll(LANGUAGE_TOKEN, language));
    const localDirectory = resolve(cwd, ...resolvedSegments);
    try {
      await access(join(localDirectory, ...requiredFile.split('/')), constants.R_OK);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          `El artefacto "${language}" no contiene el archivo requerido: ${requiredFile}`,
          { cause: error },
        );
      }
      throw error;
    }
    artifacts.push({ name: language, localDirectory });
  }
  artifacts.sort((left, right) => left.name.localeCompare(right.name));
  if (artifacts.length === 0) {
    throw new Error(`No se ha detectado ningun artefacto con el patron: ${artifactPathPattern}`);
  }
  return artifacts;
}
