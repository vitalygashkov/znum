import { writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import sharp from 'sharp';
import { joinImages } from 'join-images';
import { SingleBar, Presets } from 'cli-progress';

import { createToken } from './token.js';
import { fetchPage } from './api.js';
import { DELAY_BETWEEN_REQUESTS } from './constants.js';
import { logout } from './auth.js';
import { getTextBetween } from './utils.js';

export const toJpeg = async (inputBuffer) => {
  return sharp(inputBuffer, { density: 200 })
    .flatten({ background: '#FFFFFF' })
    .jpeg({ mozjpeg: true })
    .toBuffer()
    .catch((e) => {
      console.error(`\nОшибка конвертации в JPEG`);
      throw e;
    });
};

export const decryptSvg = (encryptedSVG, cryptoKey) => {
  let digitOrd = { 0: 48, 1: 49, 2: 50, 3: 51, 4: 52, 5: 53, 6: 54, 7: 55, 8: 56, 9: 57 };
  let digitChr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let key = Array.from(cryptoKey)
    .map((c) => c.charCodeAt(0))
    .join('');
  let e = key.length,
    h = 0,
    decrypted = '',
    startDecrypt = false;
  for (const char of encryptedSVG) {
    if (char in digitOrd && startDecrypt) {
      let r = parseInt(char, 10) - parseInt(key[h], 10);
      if (r < 0) r += 10;
      decrypted += digitChr[r];
      h = (h + 1) % e;
    } else {
      decrypted += char;
      if (char === '>') startDecrypt = true;
    }
  }
  return decrypted;
};

export const downloadImages = async (dir, documentId, { pagesCount, cryptoKey, cryptoKeyId }) => {
  let error = '';
  let currentPage = 1;
  const pages = [];
  const downloadProgress = new SingleBar({}, Presets.shades_classic);
  downloadProgress.start(pagesCount - currentPage + 1, 0);
  do {
    const pageFilename = `page_${currentPage}.jpeg`;
    const pageFilepath = join(dir, pageFilename);
    const next = () => {
      pages.push(pageFilepath);
      downloadProgress.update(currentPage);
      currentPage++;
    };
    const file = await stat(pageFilepath).catch(() => null);
    if (file) {
      next();
      continue;
    }
    const token = createToken(documentId, currentPage, cryptoKey, cryptoKeyId);
    const { statusText, slices, svg, statusCode } = await fetchPage(documentId, currentPage, token);
    if (statusText !== 'OK') {
      error = statusText || statusCode;
      console.error(`\nСтраница ${currentPage}. Ошибка: ${statusText || statusCode}`);
      if (error.includes('Ошибка авторизации')) await logout();
    } else if (slices.length) {
      const sliceNames = slices.map((_, i) => `page_${currentPage}_${i}.png`);
      const slicePaths = sliceNames.map((name) => join(dir, name));
      await mkdir(dir, { recursive: true });
      for (let i = 0; i < slices.length; i++) await writeFile(slicePaths[i], slices[i]);
      const imageObject = await joinImages(slicePaths);
      imageObject.toFile(pageFilepath);
      for (let i = 0; i < slices.length; i++) await unlink(slicePaths[i]);
      next();
    } else if (svg) {
      await mkdir(dir, { recursive: true });
      let decryptedSvg = decryptSvg(svg, cryptoKey);

      // Конвертируем встроенные WEBP в JPEG для дальнейшей корректной конвертации из SVG в PNG
      for (const partWithImage of decryptedSvg.split('<image').slice(1)) {
        const webpStart = `data:image/webp;base64,`;
        const webpEnd = `"/>`;
        const webpBase64 = getTextBetween(partWithImage, webpStart, webpEnd)?.trim();
        if (!webpBase64) continue;
        const jpeg = await toJpeg(Buffer.from(webpBase64, 'base64'));
        const jpegStart = webpStart.replace('webp', 'jpeg');
        const startIndex = partWithImage.indexOf(webpStart);
        const endIndex = startIndex + webpStart.length + webpBase64.length + webpEnd.length;
        decryptedSvg = decryptedSvg.replace(
          partWithImage.slice(startIndex, endIndex),
          `${jpegStart}${jpeg.toString('base64')}${webpEnd}`
        );
      }

      const pageData = await toJpeg(Buffer.from(decryptedSvg, 'utf-8'));
      if (!pageData) throw new Error('Не удалось сохранить страницу');
      await writeFile(pageFilepath, pageData);
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
