# @penalara/publicacion-angular

## Castellano

`@penalara/publicacion-angular` es una herramienta de línea de comandos para compilar y publicar aplicaciones Angular estáticas mediante SFTP. Los scripts de build, las rutas de artefactos y las ramas se definen en cada proyecto, por lo que funciona tanto con Angular CLI como con Nx sin incorporar lógica de una aplicación concreta.

### Instalación

```bash
npm install --save-dev --save-exact @penalara/publicacion-angular@<version>
```

El paquete expone el binario `penalara-publicacion`:

```json
{
  "scripts": {
    "publicar:pruebas": "penalara-publicacion pruebas",
    "publicar:prod": "penalara-publicacion produccion --no-version"
  }
}
```

La configuración se guarda en `tools/publicacion/publicacion.config.json` y usa SFTP en todos los entornos:

```json
{
  "vcs": {
    "type": "auto"
  },
  "deploymentLog": {
    "remotePath": "/despliegues-automaticos.log"
  },
  "release": {
    "tagPrefix": "example-angular-app"
  },
  "environments": {
    "pruebas": {
      "name": "Pruebas",
      "buildScript": "build:pruebas",
      "artifactPathPattern": "dist/pruebas/{language}/browser/{language}",
      "requiredFile": "index.html",
      "versionBranch": "versiones-pruebas",
      "publicationBranch": "publicacion-pruebas",
      "sftpConfig": {
        "sshAlias": "web-testing",
        "remoteDirectory": "/www/application"
      }
    },
    "produccion": {
      "name": "Producción",
      "buildScript": "build:produccion",
      "artifactPathPattern": "dist/produccion/{language}/browser/{language}",
      "requiredFile": "index.html",
      "versionBranch": "versiones-produccion",
      "publicationBranch": "publicacion-produccion",
      "sftpConfig": {
        "sshAlias": "web-production",
        "remoteDirectory": "/www/application"
      }
    }
  }
}
```

Uso habitual:

```bash
npm run publicar:pruebas -- --new-version 1.2.3
npm run publicar:pruebas -- --new-version
npm run publicar:pruebas -- --no-version
```

Con `--new-version` se solicita la versión cuando no se indica. Con `--no-version` se publica la versión actual de `package.json` sin crear un commit de versión ni un tag. Si no se pasa ninguno, `--no-version` es el valor predeterminado al ejecutar desde `versionBranch`; en las demás ramas se usa `--new-version`.

Documentación detallada:

- [Manual de uso](docs/uso.es.md)
- [Manual de configuración](docs/configuracion.es.md)

### Licencia

Este proyecto se distribuye bajo la [licencia MIT](LICENSE).

## English

`@penalara/publicacion-angular` is a command-line tool that builds and publishes static Angular applications over SFTP. Build scripts, artifact paths, and branches are configured by each consumer, so it supports both Angular CLI and Nx without application-specific logic.

### Installation

```bash
npm install --save-dev --save-exact @penalara/publicacion-angular@<version>
```

The package exposes the `penalara-publicacion` binary. Store its SFTP configuration in `tools/publicacion/publicacion.config.json`.

Typical usage:

```bash
npm run publicar:pruebas -- --new-version 1.2.3
npm run publicar:pruebas -- --new-version
npm run publicar:pruebas -- --no-version
```

Detailed documentation:

- [Usage guide](docs/usage.en.md)
- [Configuration guide](docs/configuration.en.md)

### License

This project is distributed under the [MIT License](LICENSE).
