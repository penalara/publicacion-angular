import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadPublicationConfig } from '../src/config.mjs';

const baseConfig = {
  vcs: { type: 'mercurial', remote: 'default' },
  environments: {
    pruebas: {
      name: 'Pruebas',
      buildScript: 'build:testing',
      artifactPathPattern: 'dist/testing/{language}/browser/{language}',
      requiredFile: 'index.html',
      versionBranch: 'versions-testing',
      publicationBranch: 'publication-testing',
      sftpConfig: {
        sshAlias: 'web-testing',
        remoteDirectory: '/www/application',
      },
    },
    produccion: {
      name: 'Production',
      buildScript: 'build:production',
      artifactPathPattern: 'dist/production/app-{language}/{language}',
      requiredFile: 'index.html',
      sftpConfig: {
        sshAlias: 'web-production',
        remoteDirectory: '/www/application',
      },
    },
  },
};

async function withFiles(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'publication-config-'));
  const configPath = join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify(baseConfig));
  try {
    await callback({ configPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('carga la configuracion SFTP del entorno', async () => {
  await withFiles(async ({ configPath }) => {
    const config = await loadPublicationConfig('pruebas', { configPath });
    assert.equal(config.sftpConfig.sshAlias, 'web-testing');
    assert.equal(config.sftpConfig.sshTimeoutMs, 300000);
    assert.equal(config.versionBranch, 'versions-testing');
  });
});

test('valida y carga el timeout SSH personalizado', async () => {
  await withFiles(async ({ configPath }) => {
    const configured = structuredClone(baseConfig);
    for (const value of [0, -1, 1.5, '300000', null, 2147483648]) {
      configured.environments.pruebas.sftpConfig.sshTimeoutMs = value;
      await writeFile(configPath, JSON.stringify(configured));
      await assert.rejects(loadPublicationConfig('pruebas', { configPath }), /sshTimeoutMs/u);
    }
    configured.environments.pruebas.sftpConfig.sshTimeoutMs = 600000;
    await writeFile(configPath, JSON.stringify(configured));
    const config = await loadPublicationConfig('pruebas', { configPath });
    assert.equal(config.sftpConfig.sshTimeoutMs, 600000);
  });
});

test('rechaza la configuracion transport anterior', async () => {
  await withFiles(async ({ configPath }) => {
    const invalid = structuredClone(baseConfig);
    invalid.environments.pruebas.transport = { type: 'ftp' };
    await writeFile(configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('pruebas', { configPath }), /transport.*sftpConfig/u);
  });
});

test('rechaza la configuracion de log remoto anterior', async () => {
  await withFiles(async ({ configPath }) => {
    const invalid = structuredClone(baseConfig);
    invalid.deploymentLog = { remotePath: '/deployment.log' };
    await writeFile(configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('pruebas', { configPath }), /deploymentLog/u);
  });
});

test('carga el prefijo de tag configurado para releases', async () => {
  await withFiles(async (paths) => {
    const configured = structuredClone(baseConfig);
    configured.release = { tagPrefix: 'example-release' };
    await writeFile(paths.configPath, JSON.stringify(configured));

    const config = await loadPublicationConfig('pruebas', paths);
    assert.equal(config.tagPrefix, 'example-release');
  });
});

test('rechaza un prefijo de tag no valido', async () => {
  await withFiles(async (paths) => {
    const configured = structuredClone(baseConfig);
    configured.release = { tagPrefix: 'example release' };
    await writeFile(paths.configPath, JSON.stringify(configured));

    await assert.rejects(
      loadPublicationConfig('pruebas', paths),
      /release\.tagPrefix/u,
    );
  });
});

test('versionBranch requiere una publicationBranch diferente', async () => {
  await withFiles(async (paths) => {
    const invalid = structuredClone(baseConfig);
    delete invalid.environments.pruebas.publicationBranch;
    await writeFile(paths.configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('pruebas', paths), /requiere publicationBranch/u);
  });
});

test('el patron de artefactos debe contener language', async () => {
  await withFiles(async (paths) => {
    const invalid = structuredClone(baseConfig);
    invalid.environments.pruebas.artifactPathPattern = 'dist/testing/es';
    await writeFile(paths.configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('pruebas', paths), /\{language\}/u);
  });
});
