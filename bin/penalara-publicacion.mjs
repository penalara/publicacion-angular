#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  console.error('\nERROR: La publicacion no ha podido completarse.');
  console.error(error);
  process.exitCode = 1;
}
