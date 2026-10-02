# Manual de uso

## 1. Objetivo

`@penalara/publicacion-angular` compila una aplicación, descubre sus artefactos estáticos y los activa mediante SFTP en un servidor remoto mediante directorios `<idioma>_new`, `<idioma>` y `<idioma>_old`. El mismo flujo funciona con Git y Mercurial.

## 2. Requisitos

- Node.js 20.9 o posterior y npm.
- Un repositorio Git o Mercurial con identidad y remoto configurados.
- Workspace limpio, incluidos los archivos no versionados.
- Herramienta OpenSSH `sftp` y un alias configurado para el servidor remoto.
- Un script npm que compile y pruebe todos los artefactos necesarios.

## 3. Invocación

```text
penalara-publicacion <entorno> [versión] [opciones]
```

Ejemplos:

```bash
npm run publicar:pruebas -- --new-version 2.1.0
npm run publicar:pruebas -- --new-version
npm run publicar:pruebas -- --no-version
npm run publicar:pruebas -- --resume --new-version 2.1.0
```

El entorno selecciona una entrada de `publicacion.config.json`.

## 4. Modos de versión

### `--new-version`

Es el modo predeterminado, salvo al ejecutar desde la `versionBranch` configurada. Si no se proporciona una versión, se muestra la versión actual y se propone su siguiente incremento `patch`. Pulsar Intro acepta la propuesta. En procesos sin terminal se exige una versión explícita.

El orden es:

1. Escribir la nueva versión en `package.json`.
2. Ejecutar el script de build y pruebas.
3. Restaurar `package.json` y terminar si falla el script.
4. Crear `Preparamos version <versión>` en la rama origen.
5. Crear `<name>-<versión>` sobre ese commit.
6. Comprobar sin modificar el workspace que la rama de publicación no aporta cambios respecto al ancestro común.
7. Transferir y activar los artefactos y actualizar el registro remoto.
8. Fusionar el origen en `publicationBranch`.
9. Verificar que el árbol fusionado coincide con el origen.
10. Crear `Publicamos version <versión> en <entorno>`.
11. Hacer push.

### `--no-version`

Usa la versión SemVer actual de `package.json`. No acepta una versión posicional, no modifica el fichero, no crea un commit de preparación y no crea ni exige un tag.

El build y las pruebas se ejecutan antes de cambiar de rama. Si terminan correctamente, se prevalida el merge y se completa el despliegue remoto. Solo entonces se fusiona el origen, se crea el commit de publicación y se hace push.

### Selección automática

- Desde la `versionBranch` del entorno: `--no-version`.
- Desde cualquier otra rama: `--new-version`.
- Un flag explícito siempre prevalece.
- `--new-version` y `--no-version` no pueden combinarse.

## 5. Ramas y confirmaciones

Git considera estándar `main` y `master`; Mercurial considera estándar `default`. Una rama origen diferente requiere confirmación interactiva o `--allow-nonstandard-source`. La `versionBranch` configurada está autorizada y no muestra esa advertencia.

Si el origen coincide con `publicationBranch`, se pide confirmación y se crea un commit vacío de publicación. En automatización se usa `--allow-nonstandard-source` para autorizar esta situación.

La rama de publicación debe existir. El publicador nunca la crea. Antes de conectar se rechaza una rama de publicación que contenga cambios respecto al ancestro común, porque el merge no conservaría exactamente el árbol validado en origen. El merge real se ejecuta únicamente después de completar el despliegue remoto.

## 6. Transferencia y activación

Primero se transfieren todos los artefactos como `<idioma>_new`. Solo cuando todas las subidas terminan se activa cada idioma:

1. Se elimina el `<idioma>_old` anterior.
2. Se mueve `<idioma>` a `<idioma>_old` si existe.
3. Se mueve `<idioma>_new` a `<idioma>`.

Si falla el último paso se intenta restaurar la versión anterior. No deben ejecutarse dos publicaciones simultáneas contra el mismo destino.

## 7. Reanudación

`--resume` reanuda un release preparado localmente después de un fallo. En `--new-version` verifica la versión y el tag local. En `--no-version` reutiliza el commit de publicación cuando coincide con el origen y el entorno.

Si falla únicamente el push final, el despliegue ya está activo. No repita la publicación: ejecute manualmente el push indicado por el error.

Si el merge final falla de forma inesperada después de superar la prevalidación, el despliegue remoto ya está activo, pero no se crea el commit de publicación ni se hace push. Revise el repositorio y el estado remoto antes de continuar.

## 8. Resultado y retorno

El push solo se ejecuta después del despliegue y del registro remoto. Git envía atómicamente las ramas y el tag; Mercurial realiza un único `hg push`. Al terminar o fallar, el workspace vuelve a la rama origen siempre que el VCS lo permita.

## 9. Automatización

En CI indique siempre el modo y, para `--new-version`, la versión. Use `--allow-nonstandard-source` cuando la rama no sea estándar. No hay prompts disponibles sin TTY.
