import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadPublicationConfig } from '../src/config.mjs';

const baseConfig = {
  vcs: { type: 'mercurial', remote: 'default' },
  deploymentLog: { remotePath: '/deployment.log' },
  environments: {
    pruebas: {
      name: 'Pruebas',
      buildScript: 'build:testing',
      artifactPathPattern: 'dist/testing/{language}/browser/{language}',
      requiredFile: 'index.html',
      versionBranch: 'versions-testing',
      publicationBranch: 'publication-testing',
      transport: {
        type: 'ftp',
        host: 'ftp.testing.example.com',
        port: 21,
        remoteDirectory: '/www/application',
      },
    },
    produccion: {
      name: 'Production',
      buildScript: 'build:production',
      artifactPathPattern: 'dist/production/app-{language}/{language}',
      requiredFile: 'index.html',
      transport: {
        type: 'sftp',
        sshAlias: 'web-production',
        remoteDirectory: '/www/application',
      },
    },
  },
};

async function withFiles(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'publication-config-'));
  const configPath = join(directory, 'config.json');
  const credentialsPath = join(directory, 'credentials.json');
  await writeFile(configPath, JSON.stringify(baseConfig));
  await writeFile(credentialsPath, JSON.stringify({
    'example-app': {
      pruebas: { username: 'test-user', password: 'test-password' },
    },
  }));
  try {
    await callback({ configPath, credentialsPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('carga FTP y credenciales por proyecto y entorno', async () => {
  await withFiles(async (paths) => {
    const config = await loadPublicationConfig('example-app', 'pruebas', paths);
    assert.equal(config.transport.type, 'FTP');
    assert.equal(config.transport.username, 'test-user');
    assert.equal(config.versionBranch, 'versions-testing');
  });
});

test('SFTP no lee el fichero de credenciales', async () => {
  await withFiles(async ({ configPath }) => {
    const config = await loadPublicationConfig('example-app', 'produccion', {
      configPath,
      credentialsPath: join(tmpdir(), 'does-not-exist.json'),
    });
    assert.equal(config.transport.type, 'SFTP');
    assert.equal(config.transport.sshAlias, 'web-production');
  });
});

test('carga el prefijo de tag configurado para releases', async () => {
  await withFiles(async (paths) => {
    const configured = structuredClone(baseConfig);
    configured.release = { tagPrefix: 'example-release' };
    await writeFile(paths.configPath, JSON.stringify(configured));

    const config = await loadPublicationConfig('example-app', 'pruebas', paths);
    assert.equal(config.tagPrefix, 'example-release');
  });
});

test('rechaza un prefijo de tag no valido', async () => {
  await withFiles(async (paths) => {
    const configured = structuredClone(baseConfig);
    configured.release = { tagPrefix: 'example release' };
    await writeFile(paths.configPath, JSON.stringify(configured));

    await assert.rejects(
      loadPublicationConfig('example-app', 'pruebas', paths),
      /release\.tagPrefix/u,
    );
  });
});

test('versionBranch requiere una publicationBranch diferente', async () => {
  await withFiles(async (paths) => {
    const invalid = structuredClone(baseConfig);
    delete invalid.environments.pruebas.publicationBranch;
    await writeFile(paths.configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('example-app', 'pruebas', paths), /requiere publicationBranch/u);
  });
});

test('el patron de artefactos debe contener language', async () => {
  await withFiles(async (paths) => {
    const invalid = structuredClone(baseConfig);
    invalid.environments.pruebas.artifactPathPattern = 'dist/testing/es';
    await writeFile(paths.configPath, JSON.stringify(invalid));
    await assert.rejects(loadPublicationConfig('example-app', 'pruebas', paths), /\{language\}/u);
  });
});
