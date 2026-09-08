# @penalara/publicacion-angular

## Castellano

`@penalara/publicacion-angular` es una herramienta de línea de comandos para compilar y publicar aplicaciones Angular estáticas mediante FTP o SFTP. Los scripts de build, las rutas de artefactos, las ramas y el transporte se definen en cada proyecto, por lo que funciona tanto con Angular CLI como con Nx sin incorporar lógica de una aplicación concreta.

### Instalación

```bash
npm install --save-dev --save-exact @penalara/publicacion-angular@1.0.1
```

El paquete expone el binario `penalara-publicacion`:

```json
{
  "scripts": {
    "publicar:pruebas": "penalara-publicacion example-angular-app pruebas",
    "publicar:prod": "penalara-publicacion example-angular-app produccion"
  }
}
```

La configuración se guarda en `tools/publicacion/publicacion.config.json`. Este ejemplo usa FTP en pruebas y SFTP en producción:

```json
{
  "vcs": {
    "type": "auto"
  },
  "deploymentLog": {
    "remotePath": "/despliegues-automaticos.log"
  },
  "environments": {
    "pruebas": {
      "name": "Pruebas",
      "buildScript": "build:pruebas",
      "artifactPathPattern": "dist/pruebas/{language}/browser/{language}",
      "requiredFile": "index.html",
      "versionBranch": "versiones-pruebas",
      "publicationBranch": "publicacion-pruebas",
      "transport": {
        "type": "ftp",
        "host": "ftp.testing.example.com",
        "port": 21,
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
      "transport": {
        "type": "sftp",
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

`@penalara/publicacion-angular` is a command-line tool that builds and publishes static Angular applications over FTP or SFTP. Build scripts, artifact paths, branches, and transports are configured by each consumer, so it supports both Angular CLI and Nx without application-specific logic.

### Installation

```bash
npm install --save-dev --save-exact @penalara/publicacion-angular@1.0.1
```

The package exposes the `penalara-publicacion` binary. Store its configuration in `tools/publicacion/publicacion.config.json`; the generic example above uses FTP for testing and SFTP for production.

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
