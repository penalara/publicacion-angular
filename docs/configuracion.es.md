# Manual de configuración

## 1. Ubicación

Cada proyecto debe contener únicamente esta configuración específica:

```text
tools/publicacion/publicacion.config.json
```

Las rutas locales son relativas a la raíz desde la que se ejecuta npm.

## 2. Estructura raíz

```json
{
  "vcs": {
    "type": "mercurial",
    "remote": "default"
  },
  "deploymentLog": {
    "remotePath": "/despliegues-automaticos.log"
  },
  "environments": {}
}
```

`vcs.type` admite `auto`, `git` y `mercurial`. El remoto predeterminado es `origin` en Git y `default` en Mercurial.

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
| `transport` | Sí | Configuración FTP o SFTP. |

Si se declara `versionBranch`, también debe declararse `publicationBranch`, y no pueden ser iguales.

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

FTP transmite las credenciales y el contenido sin cifrar. Úselo solo cuando el servidor no ofrezca un transporte seguro.

Las credenciales se guardan fuera del repositorio en `~/.npm/publicacion.credenciales.json`:

```json
{
  "example-angular-app": {
    "pruebas": {
      "username": "example-user",
      "password": "example-password"
    }
  }
}
```

El primer nivel coincide con el argumento `<proyecto>` del CLI y el segundo con `<entorno>`. El publicador no crea ni modifica este fichero.

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

SFTP no lee el fichero de credenciales. Usa el alias de la configuración OpenSSH del usuario. La cuenta debe permitir el subsistema SFTP y los comandos remotos POSIX `test`, `rm` y `mv`.

Compruebe el acceso antes de publicar:

```bash
ssh web-production
sftp web-production
```

## 7. Ramas y VCS

La publicación exige un workspace limpio. La rama de publicación debe existir localmente o en el remoto configurado. Git usa un merge `--no-ff`; Mercurial crea un changeset de merge. El árbol resultante debe coincidir exactamente con la revisión origen.

El tag de `--new-version` es `${name}-${version}`, donde `name` procede del `package.json`, no del identificador de proyecto usado para credenciales.

## 8. Registro remoto

`deploymentLog.remotePath` debe ser una ruta absoluta. El fichero contiene versión, revisión, usuario del sistema y fecha local. Su actualización usa los sufijos `_new` y `_old` y dispone de rollback propio.

La cuenta remota necesita permisos de lectura, escritura, eliminación y renombrado tanto en `remoteDirectory` como en la ruta del log.

## 9. Seguridad

- No incluya contraseñas, claves privadas ni tokens en la configuración versionada.
- No desactive la comprobación de claves de host SSH.
- No comparta `publicacion.credenciales.json`.
- Revise manualmente cualquier fallo de rollback antes de repetir una publicación.
