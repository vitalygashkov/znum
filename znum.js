#!/usr/bin/env node

import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { input } from '@inquirer/prompts';
import { login } from './src/auth.js';
import { getTextBetween } from './src/utils.js';
import { fetchDocumentInfo } from './src/api.js';
import { convertImagesToPdf } from './src/pdf.js';
import { downloadImages } from './src/images.js';
import { WORK_DIR } from './src/constants.js';
import { args } from './src/args.js';

(async () => {
  await login();
  const url =
    args.values.link || args.positionals[0] || (await input({ message: 'Вставь ссылку сюда' }));
  const id = getTextBetween(url, 'id=', '&');
  console.log('Получение информации...');
  const readerUrl = url.includes('read') ? url : `https://znanium.ru/read?id=${id}`;
  const info = await fetchDocumentInfo(readerUrl);
  console.log('Скачивание страниц...');
  const imagesDir = join(WORK_DIR, id);
  const images = await downloadImages(imagesDir, id, info);
  await setTimeout(500);
  const output = join(WORK_DIR, `${id}.pdf`);
  console.log('Сборка страниц в PDF...');
  await convertImagesToPdf(images, output);
  await rm(imagesDir, { recursive: true, force: true });
})();

export * from './src/auth.js';
export * from './src/api.js';
export * from './src/images.js';
export * from './src/pdf.js';
