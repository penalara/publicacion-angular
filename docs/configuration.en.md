# Configuration guide

## 1. Location

Each consumer stores its project-specific settings at:

```text
tools/publicacion/publicacion.config.json
```

Local paths are relative to the directory where npm starts.

## 2. Root structure

```json
{
  "vcs": {
    "type": "git",
    "remote": "origin"
  },
  "deploymentLog": {
    "remotePath": "/deployment.log"
  },
  "environments": {}
}
```

`vcs.type` accepts `auto`, `git`, or `mercurial`. The default remote is `origin` for Git and `default` for Mercurial.

## 3. Environments

| Property | Required | Description |
|---|---:|---|
| `name` | Yes | Display name used in the publication commit. |
| `buildScript` | Yes | npm script that builds and tests the application. |
| `artifactPathPattern` | Yes | Relative pattern containing `{language}`. |
| `requiredFile` | Yes | File that must exist inside every artifact. |
| `publicationBranch` | No | Existing branch that receives the publication merge. |
| `versionBranch` | No | Source branch where `--no-version` is the default. |
| `transport` | Yes | FTP or SFTP settings. |

`versionBranch` requires `publicationBranch`, and they must differ.

## 4. Artifact patterns

`{language}` is dynamically replaced for every discovered directory and may appear multiple times:

```json
{
  "artifactPathPattern": "dist/testing/{language}/browser/{language}",
  "requiredFile": "index.html"
}
```

It may also occur inside a directory name:

```json
{
  "artifactPathPattern": "dist/apps/example-web-testing-{language}/{language}",
  "requiredFile": "index.html"
}
```

Detected identifiers accept letters, digits, dots, hyphens, and underscores. `_new` and `_old` are reserved.

## 5. FTP

```json
{
  "transport": {
    "type": "ftp",
    "host": "ftp.testing.example.com",
    "port": 21,
    "remoteDirectory": "/www/application"
  }
}
```

FTP credentials live outside the repository in `~/.npm/publicacion.credenciales.json`, grouped first by CLI project identifier and then by environment. The tool never creates or changes this file. FTP transmits credentials and content without encryption.

`remoteDirectory` is opened directly after authentication. It must be the path visible to the FTP account, not the physical server path. For example, if FileZilla starts in `public_html` and cannot navigate to its parent, configure `/public_html`. Artifacts are managed from that directory without returning to `/`.

## 6. SFTP

```json
{
  "transport": {
    "type": "sftp",
    "sshAlias": "web-production",
    "remoteDirectory": "/www/application"
  }
}
```

SFTP does not read FTP credentials. It delegates host, user, port, keys, agent, proxy, and host-key checks to the user's OpenSSH configuration. The account must support SFTP and the remote POSIX commands `test`, `rm`, and `mv`.

## 7. VCS and branches

Publication requires a clean workspace. The publication branch must exist locally or on the configured remote. Before connecting, the tool compares that branch with its common ancestor and rejects any publication-side content change. The actual merge is deferred until remote deployment succeeds. Git uses a no-fast-forward merge; Mercurial creates a merge changeset. The resulting tracked tree is checked again and must exactly match the source revision.

New-version tags use `${name}-${version}`, where `name` comes from the consumer's `package.json`.

## 8. Remote log

`deploymentLog.remotePath` must be absolute. Each line records version, revision, operating-system user, and local date. The log itself is activated through `_new` and `_old` files with rollback.

The remote account needs read, write, remove, and rename permissions for both the publication directory and log path.

## 9. Security

- Never commit passwords, private keys, passphrases, or tokens.
- Keep normal SSH host-key verification enabled.
- Never share `publicacion.credenciales.json`.
- Inspect the remote state before retrying after a rollback error.
