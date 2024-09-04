import { writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { joinImages } from 'join-images';
import { SingleBar, Presets } from 'cli-progress';
import { createToken } from './token.js';
import { fetchPage } from './api.js';
import { DELAY_BETWEEN_REQUESTS } from './constants.js';

export const downloadImages = async (dir, documentId, { pagesCount, cryptoKey, cryptoKeyId }) => {
  let error = '';
  let currentPage = 1;
  const pages = [];
  const downloadProgress = new SingleBar({}, Presets.shades_classic);
  downloadProgress.start(pagesCount - currentPage + 1, 0);
  do {
    const output = join(dir, `page_${currentPage}.png`);
    const next = () => {
      pages.push(output);
      downloadProgress.update(currentPage);
      currentPage++;
    };
    const file = await stat(output).catch(() => null);
    if (file) {
      next();
      continue;
    }
    const token = createToken(documentId, currentPage, cryptoKey, cryptoKeyId);
    const { statusText, slices, statusCode } = await fetchPage(documentId, currentPage, token);
    if (statusText !== 'OK') {
      error = statusText || statusCode;
      console.error(`\nСтраница ${currentPage}. Ошибка: ${statusText || statusCode}`);
    } else {
      const sliceNames = slices.map((_, i) => `page_${currentPage}_${i}.png`);
      const slicePaths = sliceNames.map((name) => join(dir, name));
      await mkdir(dir, { recursive: true });
      for (let i = 0; i < slices.length; i++) await writeFile(slicePaths[i], slices[i]);
      const imageObject = await joinImages(slicePaths);
      imageObject.toFile(output);
      for (let i = 0; i < slices.length; i++) await unlink(slicePaths[i]);
      next();
    }
    // Ожидание между запросами из-за ограничения частоты запросов (Rate Limiting) на стороне сервера (при превышении ошибка 503)
    await setTimeout(DELAY_BETWEEN_REQUESTS);
  } while (!error && currentPage <= pagesCount);
  downloadProgress.stop();
  if (error) {
    console.error('Ошибка скачивания');
    process.exit(1);
  } else {
    console.log('Скачивание завершено');
    return pages;
  }
};
