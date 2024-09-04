import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import prompt from 'prompt';
import { login } from './src/auth.js';
import { getTextBetween } from './src/utils.js';
import { fetchDocumentInfo } from './src/api.js';
import { convertImagesToPdf } from './src/pdf.js';
import { downloadImages } from './src/images.js';

(async () => {
  await login();
  const { url } = await prompt.get(['url']);
  const id = getTextBetween(url, 'id=', '&');
  console.log('Получение информации о книге...');
  const info = await fetchDocumentInfo(url);
  console.log('Скачивание изображений...');
  const imagesDir = join(process.cwd(), 'downloads', id);
  const images = await downloadImages(imagesDir, id, info);
  await setTimeout(500);
  console.log('Конвертирование изображений в PDF...');
  const output = join(process.cwd(), 'downloads', `${id}.pdf`);
  await convertImagesToPdf(images, output);
  await rm(imagesDir, { recursive: true, force: true });
})();

export * from './src/auth.js';
export * from './src/api.js';
export * from './src/images.js';
export * from './src/pdf.js';
