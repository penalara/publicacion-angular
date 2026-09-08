# Usage guide

## 1. Purpose

`@penalara/publicacion-angular` builds an application, discovers its static artifacts, and activates them on a remote server through `<language>_new`, `<language>`, and `<language>_old` directories. The same workflow supports Git or Mercurial and FTP or SFTP.

## 2. Requirements

- Node.js 20.9 or later and npm.
- A Git or Mercurial repository with identity and remote configured.
- A clean workspace, including untracked files.
- FTP access or the OpenSSH `ssh` and `sftp` tools.
- An npm script that builds and tests every required artifact.

## 3. Invocation

```text
penalara-publicacion <project> <environment> [version] [options]
```

```bash
npm run publish:testing -- --new-version 2.1.0
npm run publish:testing -- --new-version
npm run publish:testing -- --no-version
npm run publish:testing -- --resume --new-version 2.1.0
```

The project identifier selects FTP credentials. The environment selects an entry from `publicacion.config.json`.

## 4. Version modes

### `--new-version`

This is the default unless the command starts from the configured `versionBranch`. When no version is supplied, the CLI displays the current version and suggests the next SemVer `patch`. Press Enter to accept it. Non-interactive processes must provide the version explicitly.

The build and tests run after changing `package.json` but before creating history. A failure restores the file exactly. Success creates `Preparamos version <version>` and tags it as `<name>-<version>`. The tool then verifies without changing the workspace that the publication branch adds no content after the common ancestor, completes the remote deployment and log, merges into `publicationBranch`, creates `Publicamos version <version> en <environment>`, and finally pushes.

### `--no-version`

This mode uses the current valid SemVer from `package.json`. It rejects a positional version and creates neither a version commit nor a tag. Build, tests, merge prevalidation, and remote deployment all complete before switching branches or creating publication history.

### Automatic selection

- From the environment's `versionBranch`: `--no-version`.
- From any other branch: `--new-version`.
- An explicit flag always wins.
- Both flags are mutually exclusive.

## 5. Branches and confirmation

Git treats `main` and `master` as standard source branches; Mercurial uses `default`. Any other source requires interactive confirmation or `--allow-nonstandard-source`. A configured `versionBranch` is explicitly authorized.

Running directly from `publicationBranch` also requires confirmation and produces an empty publication commit. The publication branch must already exist. Before connecting, the tool rejects a publication branch containing content changes after the common ancestor. The actual merge runs only after remote deployment succeeds, and its resulting tree is checked again before commit.

## 6. Transfer and activation

All artifacts are uploaded as `<language>_new` before any active directory changes. Activation retains the prior directory as `<language>_old` and attempts immediate rollback when the final rename fails. Never run concurrent publications against the same destination.

## 7. Resume and push

`--resume` continues a locally prepared release. New-version mode validates its local tag; no-version mode validates the prepared publication commit. Push only happens after deployment and remote logging succeed.

If the final push alone fails, deployment is already active. Follow the reported manual push instruction instead of publishing again.

If the final merge fails unexpectedly after passing prevalidation, remote deployment is already active, but no publication commit or push is created. Inspect both repository and remote state before continuing.

Git pushes source branch, publication branch, and tag atomically. Mercurial performs one `hg push`. The tool returns to the original branch after success or failure whenever possible.

## 8. CI

Always provide an explicit mode in CI and provide a version with `--new-version`. Use `--allow-nonstandard-source` for authorized nonstandard branches. Missing input fails instead of waiting when no TTY is available.
