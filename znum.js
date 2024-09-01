const { existsSync, createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const { createHmac } = require('node:crypto');
const { join } = require('node:path');
const { setTimeout } = require('node:timers/promises');
const { fetch } = require('undici');
const { joinImages } = require('join-images');
const prompt = require('prompt');
const cliProgress = require('cli-progress');
const PDFDocument = require('pdfkit');

const COOKIES_PATH = join(process.cwd(), 'cookies.txt');
const DOWNLOADS_DIR = join(process.cwd(), 'downloads');

const commonHeaders = {
  accept: 'application/xml, text/xml, */*; q=0.01',
  'accept-language': 'ru-RU,ru;q=0.9,en-NL;q=0.8,en-US;q=0.7,en;q=0.6,vi;q=0.5',
  'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

const getTextBetween = (source, startStr, endStr) => source?.split(startStr)?.[1]?.split(endStr)?.[0];

const getPageUrl = (contentId, pageNumber) =>
  `https://znanium.ru/read2/page?doc=${contentId}&pgnum=${pageNumber}&currnum=${pageNumber}&rotate=0`;

function createToken(documentId, pageNumber, cryptoKey, cryptoKeyId, t) {
  const timestamp = Math.floor(Date.now() / 1000);
  this.timeSyncDelta = 1;
  this.secLog = `init(time:${timestamp},serverTime:${timestamp},key:${cryptoKey},id:${cryptoKeyId},${cryptoKey}:${cryptoKeyId});`;
  if (this.lastJwt && this.lastJwtTime && timestamp - this.lastJwtTime < 90 && this.lastJwtCalls < 10) {
    this.lastJwtCalls += 1;
    return this.lastJwt;
  }
  const headerString = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const time = timestamp - this.timeSyncDelta;
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
    deltaTime: this.timeSyncDelta,
    log: this.secLog,
    case: t ? 1 : 0,
  };
  const bodyString = Buffer.from(JSON.stringify(body)).toString('base64');
  const hmac = createHmac('sha256', key);
  hmac.update(`${headerString}.${bodyString}`);
  const hashString = hmac.digest('base64');
  this.lastJwtCalls = 1;
  this.lastJwtTime = timestamp;
  this.lastJwt = `${headerString}.${bodyString}.${hashString}`;
  return this.lastJwt;
}

const fetchDocumentInfo = async (contentUrl, cookie) => {
  const response = await fetch(contentUrl, { headers: { cookie, ...commonHeaders } });
  const body = await response.text();
  const pagesAllText = getTextBetween(body, 'pages__all">', '<');
  const pagesCount = pagesAllText.replace(/^\D+/g, '');
  const keyString = getTextBetween(body, 'id="render-ver" type="hidden" value="', '"');
  const [cryptoKey, cryptoKeyId] = keyString.split(':');
  return { pagesCount: parseInt(pagesCount), cryptoKey, cryptoKeyId };
};

const fetchPage = async (contentId, pageNumber, cookie, token) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  const response = await fetch(pageUrl, { headers: { cookie, authorization: `Bearer ${token}`, ...commonHeaders } });
  const body = await response.text();
  // console.log(body);
  const statusText = getTextBetween(body, '<status_text>', '</status_text>');
  const slicesB64 = [];
  let currentSlice = 1;
  do {
    const sliceFragment = getTextBetween(body, `<slice${currentSlice}>`, `</slice${currentSlice}>`);
    const sliceB64 = getTextBetween(sliceFragment, ',', ']');
    if (sliceB64) {
      slicesB64.push(sliceB64);
      currentSlice++;
    } else currentSlice = -1;
  } while (currentSlice >= 1);
  const slices = slicesB64.map((data) => Buffer.from(data, 'base64'));
  return { statusText, slices, body, headers: response.headers, statusCode: response.status };
};

// https://znanium.ru/read?id=420612

const fetchToken = async () => {
  const response = await fetch('https://znanium.ru/', { headers: commonHeaders });
  const body = await response.text();
  const csrfToken = getTextBetween(body, 'name="csrf-token" content="', '"');
  return csrfToken;
};

const fetchCookies = async (csrfToken, username, password) => {
  const response = await fetch('https://znanium.ru/site/login', {
    method: 'POST',
    headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      '_csrf-frontend': csrfToken,
      'LoginForm[username]': username,
      'LoginForm[password]': password,
      'LoginForm[rememberMe]': '1',
      'LoginForm[returnUrl]': 'https://znanium.ru/',
      did: '',
      pid: '',
      page: '',
      'login-button': '',
    }),
  });
  return response.headers.get('set-cookie');
};

const login = async (username, password) => {
  if (existsSync(COOKIES_PATH)) return fs.readFile(COOKIES_PATH, 'utf-8').then((data) => data.split('\n').join(' '));
  const answer = username && password ? { username, password } : await prompt.get(['username', 'password']);
  console.log('Авторизация...');
  const csrfToken = await fetchToken();
  const cookies = await fetchCookies(csrfToken, answer.username, answer.password);
  await fs.writeFile(COOKIES_PATH, cookies);
  return cookies;
};

(async () => {
  const cookies = await login('vitalygashkov@vk.com', '@THbyAKJ46jRU@');

  const { url } = { url: 'https://znanium.ru/read?id=420612' } || (await prompt.get(['url']));
  const documentId = getTextBetween(url, 'id=', '&');

  console.log('Получение информации о книге...');
  const { pagesCount, cryptoKey, cryptoKeyId } = await fetchDocumentInfo(url, cookies);

  let error = '';
  let currentPage = 1;

  const workDir = join(DOWNLOADS_DIR, documentId);
  const pages = [];

  console.log('Скачивание изображений...');
  const downloadProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  downloadProgress.start(pagesCount - currentPage + 1, 0);
  do {
    const token = createToken(documentId, currentPage, cryptoKey, cryptoKeyId);
    const { statusText, slices, statusCode } = await fetchPage(documentId, currentPage, cookies, token);
    if (statusText !== 'OK') {
      error = statusText || statusCode;
      console.error(`\nСтраница ${currentPage}. Ошибка: ${statusText || statusCode}`);
    } else {
      const sliceNames = slices.map((_, i) => `page_${currentPage}_${i}.png`);
      const slicePaths = sliceNames.map((name) => join(workDir, name));
      await fs.mkdir(workDir, { recursive: true });
      for (let i = 0; i < slices.length; i++) await fs.writeFile(slicePaths[i], slices[i]);
      const imageObject = await joinImages(slicePaths);
      const output = join(workDir, `page_${currentPage}.png`);
      imageObject.toFile(output);
      for (let i = 0; i < slices.length; i++) await fs.unlink(slicePaths[i]);
      pages.push(output);
      downloadProgress.update(currentPage);
    }
    await setTimeout(1000);
    currentPage++;
  } while (!error && currentPage <= pagesCount);
  downloadProgress.stop();
  if (error) return console.error('Ошибка скачивания');
  else console.log('Скачивание завершено');

  await setTimeout(500);
  console.log('Конвертирование изображений в PDF...');
  const pdfProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
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
  await fs.rm(workDir, { recursive: true, force: true });
  doc.end();

  pdfProgress.stop();
  console.log(`Конвертирование завершено: ${pdfPath}`);
})();
