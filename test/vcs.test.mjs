import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProcess } from '../src/process.mjs';
import { GitVcs } from '../src/vcs/git.mjs';
import { MercurialVcs } from '../src/vcs/mercurial.mjs';

async function commandAvailable(command, args) {
  try {
    await runProcess(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('Git prepara version, tag y merge con el mismo arbol', {
  skip: !(await commandAvailable('git', ['--version'])),
}, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publication-git-'));
  const packagePath = join(cwd, 'package.json');
  try {
    await runProcess('git', ['init', '--initial-branch=main'], { cwd });
    await runProcess('git', ['config', 'user.name', 'Publication Test'], { cwd });
    await runProcess('git', ['config', 'user.email', 'publication@example.com'], { cwd });
    await runProcess('git', ['config', 'core.autocrlf', 'false'], { cwd });
    await writeFile(packagePath, '{"name":"example","version":"1.0.0"}\n');
    await writeFile(join(cwd, 'index.txt'), 'initial\n');
    await runProcess('git', ['add', '.'], { cwd });
    await runProcess('git', ['commit', '-m', 'Initial'], { cwd });
    await runProcess('git', ['branch', 'publication'], { cwd });

    const vcs = new GitVcs(cwd);
    await writeFile(packagePath, '{"name":"example","version":"1.1.0"}\n');
    await vcs.assertOnlyPackageChanged(packagePath);
    await vcs.commitVersion(packagePath, 'Preparamos version 1.1.0');
    await vcs.createTag('example-1.1.0');
    const sourceRevision = await vcs.revision();
    await vcs.checkout('publication');
    await writeFile(join(cwd, 'publication-only.txt'), 'must be reconciled\n');
    await runProcess('git', ['add', 'publication-only.txt'], { cwd });
    await runProcess('git', ['commit', '-m', 'Publication-only change'], { cwd });
    await vcs.checkout('main');
    await assert.rejects(
      vcs.assertMergePreservesSource('publication', sourceRevision),
      /contiene cambios de contenido/u,
    );
    await vcs.checkout('publication');
    await rm(join(cwd, 'publication-only.txt'));
    await runProcess('git', ['add', '--all'], { cwd });
    await runProcess('git', ['commit', '-m', 'Reconcile publication content'], { cwd });
    await vcs.checkout('main');
    await vcs.assertMergePreservesSource('publication', sourceRevision);
    await vcs.checkout('publication');
    await vcs.merge(sourceRevision);
    assert.equal(await vcs.treeMatches(sourceRevision), true);
    await vcs.commitPublication('Publicamos version 1.1.0 en Testing');
    assert.equal(await vcs.includesRevision(sourceRevision), true);
    assert.equal(await vcs.tagExists('example-1.1.0'), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('Mercurial prepara version, tag y merge con el mismo arbol', {
  skip: !(await commandAvailable('hg', ['--version', '--quiet'])),
}, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publication-hg-'));
  const packagePath = join(cwd, 'package.json');
  try {
    await runProcess('hg', ['init'], { cwd });
    await writeFile(join(cwd, '.hg', 'hgrc'), '[ui]\nusername = Publication Test <publication@example.com>\n');
    await writeFile(packagePath, '{"name":"example","version":"1.0.0"}\n');
    await writeFile(join(cwd, 'index.txt'), 'initial\n');
    await runProcess('hg', ['add'], { cwd });
    await runProcess('hg', ['commit', '-m', 'Initial'], { cwd });
    await runProcess('hg', ['branch', 'publication'], { cwd });
    await runProcess('hg', ['--config', 'ui.allowemptycommit=True', 'commit', '-m', 'Publication branch'], { cwd });
    await runProcess('hg', ['update', 'default'], { cwd });

    const vcs = new MercurialVcs(cwd);
    await writeFile(packagePath, '{"name":"example","version":"1.1.0"}\n');
    await vcs.assertOnlyPackageChanged(packagePath);
    await vcs.commitVersion(packagePath, 'Preparamos version 1.1.0');
    await vcs.createTag('example-1.1.0');
    const sourceRevision = await vcs.revision();
    await vcs.checkout('publication');
    await writeFile(join(cwd, 'publication-only.txt'), 'must be reconciled\n');
    await runProcess('hg', ['add', 'publication-only.txt'], { cwd });
    await runProcess('hg', ['commit', '-m', 'Publication-only change'], { cwd });
    await vcs.checkout('default');
    await assert.rejects(
      vcs.assertMergePreservesSource('publication', sourceRevision),
      /contiene cambios de contenido/u,
    );
    await vcs.checkout('publication');
    await rm(join(cwd, 'publication-only.txt'));
    await runProcess('hg', ['remove', '--after', 'publication-only.txt'], { cwd });
    await runProcess('hg', ['commit', '-m', 'Reconcile publication content'], { cwd });
    await vcs.checkout('default');
    await vcs.assertMergePreservesSource('publication', sourceRevision);
    await vcs.checkout('publication');
    await vcs.merge(sourceRevision);
    assert.equal(await vcs.treeMatches(sourceRevision), true);
    await vcs.commitPublication('Publicamos version 1.1.0 en Testing');
    assert.equal(await vcs.includesRevision(sourceRevision), true);
    assert.equal(await vcs.tagExists('example-1.1.0'), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
