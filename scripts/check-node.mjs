#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const requiredVersion = readFileSync(
  new URL('../.nvmrc', import.meta.url),
  'utf8',
).trim();
const requiredMajor = Number.parseInt(requiredVersion, 10);
const currentVersion = process.versions.node;
const currentMajor = Number.parseInt(currentVersion.split('.')[0], 10);

if (!Number.isInteger(requiredMajor)) {
  console.error(`Invalid Node.js version in .nvmrc: "${requiredVersion}"`);
  process.exit(1);
}

if (currentMajor !== requiredMajor) {
  console.error(
    `HelloPera requires Node.js ${requiredMajor}.x; the current runtime is ${currentVersion}.\n` +
      'Run `nvm use` (or select the version in .nvmrc with your version manager) and try again.',
  );
  process.exit(1);
}

console.log(`Node.js ${currentVersion} matches the required ${requiredMajor}.x runtime.`);
