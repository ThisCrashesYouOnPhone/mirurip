import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await copyFile(
  resolve('public', '_redirects.pages'),
  resolve('dist', '_redirects'),
);
