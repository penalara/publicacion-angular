# Manual de configuración

## 1. Ubicación

Cada proyecto contiene su configuración en:

```text
tools/publicacion/publicacion.config.json
```

Las rutas locales son relativas a la raíz desde la que se ejecuta npm.

## 2. Estructura raíz

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

`vcs.type` admite `auto`, `git` y `mercurial`. El remoto predeterminado es `origin` en Git y `default` en Mercurial.

`release.tagPrefix` es opcional y define el prefijo de los tags creados con `--new-version`. Si se omite, se usa `name` de `package.json`.

## 3. Entornos

Cada clave de `environments` puede tener cualquier nombre seguro. Sus propiedades son:

| Propiedad | Obligatoria | Descripción |
|---|---:|---|
| `name` | Sí | Nombre visible incluido en el commit de publicación. |
| `buildScript` | Sí | Script npm que compila y prueba la aplicación. |
| `artifactPathPattern` | Sí | Patrón relativo con `{language}`. |
| `requiredFile` | Sí | Fichero que debe existir dentro de cada artefacto. |
| `publicationBranch` | No | Rama existente que recibe el merge de publicación. |
| `versionBranch` | No | Rama origen cuyo modo predeterminado es `--no-version`. |
| `sftpConfig` | Sí | Configuración de conexión SFTP. |

Si se declara `versionBranch`, también debe declararse `publicationBranch`, y no pueden ser iguales.

La propiedad anterior `transport` ya no se admite. Solo se permite SFTP mediante `sftpConfig`.

## 4. Patrones de artefactos

`{language}` se sustituye dinámicamente por cada directorio encontrado. Puede aparecer más de una vez:

```json
{
  "artifactPathPattern": "dist/pruebas/{language}/browser/{language}",
  "requiredFile": "index.html"
}
```

También puede formar parte de un nombre de directorio:

```json
{
  "artifactPathPattern": "dist/apps/example-web-testing-{language}/{language}",
  "requiredFile": "index.html"
}
```

Los identificadores detectados solo admiten letras, números, punto, guion y guion bajo. `_new` y `_old` están reservados.

## 5. SFTP y SSH

```json
{
  "sftpConfig": {
    "sshAlias": "web-production",
    "remoteDirectory": "/www/application"
  }
}
```

SFTP y SSH reutilizan el mismo alias de la configuración OpenSSH del usuario. No se leen ni almacenan credenciales en el repositorio ni en ficheros de npm.

El alias se configura normalmente en `~/.ssh/config`:

```sshconfig
Host web-production
  HostName servidor.example.com
  User usuario-despliegue
  Port 22
  IdentityFile ~/.ssh/id_ed25519
```

SFTP solo conecta y transfiere los directorios `<idioma>_new`. SSH elimina restos, normaliza permisos, mueve directorios y restaura una versión anterior si falla la activación. El usuario remoto se autentica con clave pública, no necesita TTY ni forwarding y debe poder ejecutar, dentro del chroot si se usa, `rm`, `mv`, `find` y `chmod` además de una shell compatible.

`ForceCommand internal-sftp` no es compatible con este publicador porque impide las operaciones SSH requeridas. El chroot puede mantenerse, siempre que incluya la shell y los comandos indicados y el usuario tenga permisos sobre `remoteDirectory`.

Una configuración de referencia conserva autenticación por clave, chroot, ausencia de TTY y forwarding, pero no fuerza `internal-sftp` para este usuario:

```sshconfig
Match Group despliegue-web
    ChrootDirectory /srv/sftp/%u
    AuthenticationMethods publickey
    PubkeyAuthentication yes
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    DisableForwarding yes
    PermitTTY no
```

Compruebe ambos accesos antes de publicar:

```bash
sftp web-production
ssh -T web-production "true"
```

## 6. Ramas y VCS

La publicación exige un workspace limpio. La rama de publicación debe existir localmente o en el remoto configurado. Antes de conectar, el publicador compara esa rama con su ancestro común y rechaza cualquier cambio de contenido propio. El merge real se aplaza hasta completar el despliegue remoto. Git usa un merge `--no-ff`; Mercurial crea un changeset de merge. El árbol resultante se vuelve a comparar y debe coincidir exactamente con la revisión origen.

El tag de `--new-version` es `${release.tagPrefix}-${version}` cuando se configura ese valor. Si se omite, es `${name}-${version}`, donde `name` procede del `package.json`.

`--no-vsc-force` omite por completo estos requisitos y operaciones VCS. Sigue requiriendo la configuración de entorno, `package.json`, el build y el acceso SFTP+SSH.

## 7. Seguridad

- No desactive la comprobación de claves de host SSH.
- No comparta claves privadas ni frases de contraseña.
- Revise manualmente cualquier fallo de rollback antes de repetir una publicación.
- No use `ForceCommand internal-sftp` para el usuario que ejecuta este publicador.
