import { detectArtifacts } from './artifacts.mjs';
import { runNpmScript } from './npm-runner.mjs';
import { askVersion, confirm } from './prompts.mjs';
import { deploy } from './publication.mjs';
import { createTransport } from './transports/index.mjs';
import { preparePackageVersion, readPackageInfo, validateVersion } from './version.mjs';

function releaseTag(name, version) {
  const tag = `${name}-${version}`;
  if (!/^[A-Za-z0-9@][A-Za-z0-9._@/-]*$/u.test(tag) || tag.includes('..') || tag.endsWith('/')) {
    throw new Error(`El nombre de package.json produce un tag no valido: ${tag}`);
  }
  return tag;
}

function isStandardSource(vcsType, branch) {
  return vcsType === 'mercurial' ? branch === 'default' : ['main', 'master'].includes(branch);
}

async function authorizeBranches({ config, vcs, sourceBranch, allowNonstandardSource, askConfirmation }) {
  const isConfiguredVersionBranch = sourceBranch === config.versionBranch;
  if (!isStandardSource(vcs.type, sourceBranch) && !isConfiguredVersionBranch) {
    if (!allowNonstandardSource) {
      const accepted = await askConfirmation(
        `La rama origen "${sourceBranch}" no es una rama estandar. Desea continuar?`,
      );
      if (!accepted) {
        throw new Error(
          'Publicacion cancelada. En modo no interactivo use --allow-nonstandard-source para autorizarla.',
        );
      }
    }
  }
  if (config.publicationBranch === sourceBranch && !allowNonstandardSource) {
    const accepted = await askConfirmation(
      `Ya se encuentra en la rama de publicacion "${sourceBranch}". Desea continuar sin merge?`,
    );
    if (!accepted) throw new Error('Publicacion cancelada desde la propia rama de publicacion.');
  }
}

async function preparePublicationCommit({
  config,
  vcs,
  sourceBranch,
  sourceRevision,
  version,
  resume,
  remote,
}) {
  if (!config.publicationBranch) return { publicationBranch: sourceBranch, switched: false };
  const publicationMessage = `Publicamos version ${version} en ${config.name}`;
  if (config.publicationBranch === sourceBranch) {
    if (!(resume && await vcs.currentMessage() === publicationMessage)) {
      await vcs.commitPublication(publicationMessage, { empty: true });
    }
    return { publicationBranch: sourceBranch, switched: false };
  }

  await vcs.checkout(config.publicationBranch, remote);
  let mergeStarted = false;
  try {
    if (resume && await vcs.includesRevision(sourceRevision)) {
      if (await vcs.currentMessage() !== publicationMessage || !(await vcs.treeMatches(sourceRevision))) {
        throw new Error('La rama de publicacion contiene la revision origen, pero no coincide con el release reanudado.');
      }
      return { publicationBranch: config.publicationBranch, switched: true };
    }
    mergeStarted = true;
    await vcs.merge(sourceRevision);
    if (!(await vcs.treeMatches(sourceRevision))) {
      throw new Error(
        'El merge cambia el contenido de la rama origen. Resuelva previamente la divergencia de la rama de publicacion.',
      );
    }
    await vcs.commitPublication(publicationMessage);
    mergeStarted = false;
    return { publicationBranch: config.publicationBranch, switched: true };
  } catch (error) {
    if (mergeStarted) await vcs.abortMerge();
    throw error;
  }
}

export async function runRelease({
  config,
  vcs,
  mode,
  requestedVersion,
  resume = false,
  allowNonstandardSource = false,
  cwd = process.cwd(),
  build = runNpmScript,
  findArtifacts = detectArtifacts,
  transportFactory = createTransport,
  deployPublication = deploy,
  askForVersion = askVersion,
  askConfirmation = confirm,
  log = console.log,
}) {
  await vcs.assertClean();
  const sourceBranch = await vcs.currentBranch();
  await authorizeBranches({ config, vcs, sourceBranch, allowNonstandardSource, askConfirmation });
  const remote = config.vcs.remote || vcs.defaultRemote;
  await vcs.fetch(remote);
  if (config.publicationBranch && !(await vcs.branchExists(config.publicationBranch, remote))) {
    throw new Error(`No existe la rama de publicacion configurada: ${config.publicationBranch}`);
  }

  const packageInfo = await readPackageInfo(cwd);
  let version;
  let tag;
  let preparedVersion;
  let sourcePrepared = false;
  let createResumeTag = false;
  if (mode === 'new-version') {
    version = requestedVersion
      ? validateVersion(requestedVersion)
      : await askForVersion(packageInfo.version);
    tag = releaseTag(packageInfo.name, version);
    if (resume) {
      const localTagExists = await vcs.tagExists(tag);
      if (
        packageInfo.version !== version ||
        await vcs.tagExistsRemote(tag, remote)
      ) {
        throw new Error(`No existe un release local reanudable para "${tag}".`);
      }
      if (!localTagExists) {
        if (await vcs.currentMessage() !== `Preparamos version ${version}`) {
          throw new Error(`No existe el tag ni el commit de preparacion esperado para "${tag}".`);
        }
        createResumeTag = true;
      }
    } else {
      if (packageInfo.version === version) {
        throw new Error('La nueva version debe ser distinta de la version actual de package.json.');
      }
      if (await vcs.tagExists(tag) || await vcs.tagExistsRemote(tag, remote)) {
        throw new Error(`Ya existe el tag "${tag}".`);
      }
      preparedVersion = await preparePackageVersion(version, packageInfo);
    }
  } else {
    if (requestedVersion !== undefined) {
      throw new Error('--no-version no admite una version posicional.');
    }
    version = packageInfo.version;
  }

  try {
    log(`Publicacion: ${config.name}`);
    log(`Version: ${version}`);
    log(`Ejecutando npm run ${config.buildScript}...`);
    await build(config.buildScript, { cwd });
    if (mode === 'new-version' && !resume) await vcs.assertOnlyPackageChanged(packageInfo.packagePath);
    else await vcs.assertClean();

    const artifacts = await findArtifacts(config.artifactPathPattern, config.requiredFile, { cwd });
    log(`Artefactos detectados: ${artifacts.map(({ name }) => name).join(', ')}`);

    if (mode === 'new-version' && !resume) {
      await vcs.commitVersion(packageInfo.packagePath, `Preparamos version ${version}`);
      preparedVersion.commit();
      sourcePrepared = true;
      await vcs.createTag(tag);
    } else if (createResumeTag) {
      await vcs.createTag(tag);
    }

    const sourceRevision = await vcs.revision();
    if (config.publicationBranch && config.publicationBranch !== sourceBranch) {
      await vcs.assertMergePreservesSource(
        config.publicationBranch,
        sourceRevision,
        remote,
      );
    }
    const revision = await vcs.shortRevision();
    const transport = transportFactory(config);
    try {
      await deployPublication({ config, version, revision, artifacts, transport, log });
      const publicationState = await preparePublicationCommit({
        config,
        vcs,
        sourceBranch,
        sourceRevision,
        version,
        resume,
        remote,
      });
      try {
        await vcs.push({
          remote,
          sourceBranch,
          publicationBranch: publicationState.publicationBranch,
          tag: mode === 'new-version' ? tag : undefined,
        });
      } catch (error) {
        throw new Error(
          `El despliegue se completo, pero fallo el push a "${remote}". Complete el push manualmente sin repetir la publicacion.`,
          { cause: error },
        );
      }
      log('\nPublicacion completada correctamente.');
    } finally {
      if (config.publicationBranch && await vcs.currentBranch() !== sourceBranch) {
        await vcs.checkout(sourceBranch, remote);
      }
    }
  } catch (error) {
    if (preparedVersion && !sourcePrepared) {
      try {
        await preparedVersion.restore();
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          'La publicacion fallo y tambien fallo la restauracion de package.json.',
        );
      }
    }
    throw error;
  }
}

export function inferVersionMode({ explicitMode, currentBranch, versionBranch }) {
  if (explicitMode) return explicitMode;
  return versionBranch && currentBranch === versionBranch ? 'no-version' : 'new-version';
}
