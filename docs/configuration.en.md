# Configuration guide

## 1. Location

Each project stores its configuration in:

```text
tools/publicacion/publicacion.config.json
```

Local paths are relative to the directory from which npm runs.

## 2. Root structure

```json
{
  "vcs": {
    "type": "git",
    "remote": "origin"
  },
  "release": {
    "tagPrefix": "example-angular-app"
  },
  "environments": {}
}
```

`vcs.type` accepts `auto`, `git`, or `mercurial`. The default remote is `origin` for Git and `default` for Mercurial.

`release.tagPrefix` is optional and defines the prefix for tags created with `--new-version`. When omitted, `package.json.name` is used.

## 3. Environments

Each `environments` key can use any safe name. Its properties are:

| Property | Required | Description |
|---|---:|---|
| `name` | Yes | Display name used in the publication commit. |
| `buildScript` | Yes | npm script that builds and tests the application. |
| `artifactPathPattern` | Yes | Relative pattern containing `{language}`. |
| `requiredFile` | Yes | File that must exist inside every artifact. |
| `publicationBranch` | No | Existing branch that receives the publication merge. |
| `versionBranch` | No | Source branch where `--no-version` is the default. |
| `sftpConfig` | Yes | SFTP connection configuration. |

`versionBranch` requires `publicationBranch`, and they must differ.

The former `transport` property is no longer supported. Only SFTP through `sftpConfig` is allowed.

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

## 5. SFTP

```json
{
  "sftpConfig": {
    "sshAlias": "web-production",
    "remoteDirectory": "/www/application"
  }
}
```

SFTP uses an alias from the user's OpenSSH configuration. No credentials are read from or stored in the repository or npm files.

The alias is normally configured in `~/.ssh/config`:

```sshconfig
Host web-production
  HostName server.example.com
  User deployment-user
  Port 22
  IdentityFile ~/.ssh/id_ed25519
```

The account only needs to support the SFTP subsystem. The publisher uses the SFTP commands `ls`, `put`, `get`, `rm`, `rmdir`, and `rename`; it does not execute a remote shell. Verify access before publishing:

```bash
sftp web-production
```

## 6. VCS and branches

Publication requires a clean workspace. The publication branch must exist locally or on the configured remote. Before connecting, the tool compares that branch with its common ancestor and rejects any publication-side content change. The actual merge is deferred until remote deployment succeeds. Git uses a no-fast-forward merge; Mercurial creates a merge changeset. The resulting tracked tree is checked again and must exactly match the source revision.

New-version tags use `${release.tagPrefix}-${version}` when configured. Otherwise they use `${name}-${version}`, where `name` comes from the consumer's `package.json`.

## 7. Security

- Keep normal SSH host-key verification enabled.
- Never share private keys or passphrases.
- Inspect the remote state before retrying after a rollback error.
