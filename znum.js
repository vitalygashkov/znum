import { existsSync, createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, unlink, rm } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { gotScraping } from 'got-scraping';
import { Cookie, CookieJar } from 'tough-cookie';
import { joinImages } from 'join-images';
import { SingleBar, Presets } from 'cli-progress';
import PDFDocument from 'pdfkit';
import prompt from 'prompt';

const COOKIES_PATH = join(process.cwd(), 'cookies.json');
const DOWNLOADS_DIR = join(process.cwd(), 'downloads');

const DEFAULT_URL = 'https://znanium.ru/';
const cookieJar = new CookieJar();

const getTextBetween = (source, startStr, endStr) => source?.split(startStr)?.[1]?.split(endStr)?.[0];

const getPageUrl = (contentId, pageNumber) =>
  `https://znanium.ru/read2/page?doc=${contentId}&pgnum=${pageNumber}&currnum=${pageNumber}&rotate=0`;

function createToken(documentId, pageNumber, cryptoKey, cryptoKeyId, t) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeSyncDelta = 1;
  const secLog = `init(time:${timestamp},serverTime:${timestamp},key:${cryptoKey},id:${cryptoKeyId},${cryptoKey}:${cryptoKeyId});`;
  const headerString = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const time = timestamp - timeSyncDelta;
  const key = cryptoKey || 'a1b2c3d4e5';
  const body = {
    id: 'ZNANIUM-JWT',
    sub: 'znanium/reader',
    page: pageNumber,
    document: parseInt(documentId),
    exp: time + 300,
    iat: time - 120,
    secid: cryptoKeyId,
    localTime: timestamp,
    deltaTime: timeSyncDelta,
    log: secLog,
    case: t ? 1 : 0,
  };
  const bodyString = Buffer.from(JSON.stringify(body)).toString('base64');
  const hmac = createHmac('sha256', key);
  hmac.update(`${headerString}.${bodyString}`);
  const hashString = hmac.digest('base64');
  const lastJwt = `${headerString}.${bodyString}.${hashString}`;
  return lastJwt;
}

const fetchDocumentInfo = async (contentUrl) => {
  const response = await gotScraping(contentUrl, { cookieJar });
  const pagesAllText = getTextBetween(response.body, 'pages__all">', '<');
  const pagesCount = pagesAllText.replace(/^\D+/g, '');
  const keyString = getTextBetween(response.body, 'id="render-ver" type="hidden" value="', '"');
  const [cryptoKey, cryptoKeyId] = keyString.split(':');
  return { pagesCount: parseInt(pagesCount), cryptoKey, cryptoKeyId };
};

const fetchPage = async (contentId, pageNumber, token) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  const response = await gotScraping(pageUrl, { headers: { authorization: `Bearer ${token}` }, cookieJar });
  const statusText = getTextBetween(response.body, '<status_text>', '</status_text>');
  const slicesB64 = [];
  let currentSlice = 1;
  do {
    const sliceFragment = getTextBetween(response.body, `<slice${currentSlice}>`, `</slice${currentSlice}>`);
    const sliceB64 = getTextBetween(sliceFragment, ',', ']');
    if (sliceB64) {
      slicesB64.push(sliceB64);
      currentSlice++;
    } else currentSlice = -1;
  } while (currentSlice >= 1);
  const slices = slicesB64.map((data) => Buffer.from(data, 'base64'));
  return { statusText, slices, statusCode: response.statusCode };
};

const fetchLoginPage = async () => {
  const response = await gotScraping('https://znanium.ru/site/login', { cookieJar });
  const csrfToken = getTextBetween(response.body, 'name="csrf-token" content="', '"');
  return { csrfToken };
};

const fetchAuthCookies = async (username, password, csrfToken) => {
  await gotScraping('https://znanium.ru/site/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cookieJar,
    body: new URLSearchParams({
      '_csrf-frontend': csrfToken,
      'LoginForm[username]': username,
      'LoginForm[password]': password,
      'LoginForm[rememberMe]': '1',
      'LoginForm[returnUrl]': DEFAULT_URL,
      did: '',
      pid: '',
      page: '',
      'login-button': '',
    }).toString(),
  });
};

const fetchMainCookies = async () => {
  await gotScraping(DEFAULT_URL, { cookieJar });
};

const login = async (username, password) => {
  if (existsSync(COOKIES_PATH)) {
    const data = await readFile(COOKIES_PATH, 'utf-8').then((data) => JSON.parse(data));
    for (const cookie of data) await cookieJar.setCookie(Cookie.parse(cookie), DEFAULT_URL);
    return;
  }
  const answer = username && password ? { username, password } : await prompt.get(['username', 'password']);
  console.log('Авторизация...');
  const { csrfToken } = await fetchLoginPage();
  console.log(cookieJar.toJSON());
  await fetchAuthCookies(answer.username, answer.password, csrfToken);
  console.log(cookieJar.toJSON());
  await fetchMainCookies();
  // console.log(cookieJar.toJSON());
  const cookies = await cookieJar.getCookies(DEFAULT_URL).then((cookies) => cookies.map((cookie) => cookie.toString()));
  await writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  return cookies;
};

(async () => {
  await login();

  const { url } = await prompt.get(['url']);
  const documentId = getTextBetween(url, 'id=', '&');

  console.log('Получение информации о книге...');
  const info = await fetchDocumentInfo(url);

  let error = '';
  let currentPage = 11;

  const workDir = join(DOWNLOADS_DIR, documentId);
  const pages = [];

  console.log('Скачивание изображений...');
  const downloadProgress = new SingleBar({}, Presets.shades_classic);
  downloadProgress.start(info.pagesCount - currentPage + 1, 0);
  do {
    const token = createToken(documentId, currentPage, info.cryptoKey, info.cryptoKeyId);
    const { statusText, slices, statusCode } = await fetchPage(documentId, currentPage, token);
    if (statusText !== 'OK') {
      error = statusText || statusCode;
      console.error(`\nСтраница ${currentPage}. Ошибка: ${statusText || statusCode}`);
    } else {
      const sliceNames = slices.map((_, i) => `page_${currentPage}_${i}.png`);
      const slicePaths = sliceNames.map((name) => join(workDir, name));
      await mkdir(workDir, { recursive: true });
      for (let i = 0; i < slices.length; i++) await writeFile(slicePaths[i], slices[i]);
      const imageObject = await joinImages(slicePaths);
      const output = join(workDir, `page_${currentPage}.png`);
      imageObject.toFile(output);
      for (let i = 0; i < slices.length; i++) await unlink(slicePaths[i]);
      pages.push(output);
      downloadProgress.update(currentPage);
    }
    await setTimeout(1000);
    currentPage++;
  } while (!error && currentPage <= info.pagesCount);
  downloadProgress.stop();
  if (error) return console.error('Ошибка скачивания');
  else console.log('Скачивание завершено');

  await setTimeout(500);
  console.log('Конвертирование изображений в PDF...');
  const pdfProgress = new SingleBar({}, Presets.shades_classic);
  pdfProgress.start(pages.length, 0);
  const pdfPath = join(DOWNLOADS_DIR, `${documentId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.pipe(createWriteStream(pdfPath));
  for (let i = 1; i <= pages.length; i++) {
    const page = pages[i - 1];
    if (!existsSync(page)) {
      console.log(`Не найден файл страницы ${i}, пропускаем...`);
      continue;
    }
    const pageImage = doc.openImage(page);
    doc.addPage({ size: [pageImage.width, pageImage.height] });
    doc.image(pageImage, 0, 0);
    pdfProgress.update(i);
  }
  await rm(workDir, { recursive: true, force: true });
  doc.end();

  pdfProgress.stop();
  console.log(`Конвертирование завершено: ${pdfPath}`);
})();
