const fs = require('node:fs/promises');
const { join } = require('node:path');
const { fetch } = require('undici');
const { joinImages } = require('join-images');
const prompt = require('prompt');
const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const PDFDocument = require('pdfkit');
const { existsSync, createWriteStream } = require('node:fs');

const COOKIES_PATH = join(process.cwd(), 'cookies.txt');
const DOWNLOADS_DIR = join(process.cwd(), 'downloads');

const getTextBetween = (source, startStr, endStr) =>
  source?.split(startStr)?.[1]?.split(endStr)?.[0];

const login = async (username, password) => {
  console.log('Авторизация...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://znanium.com/site/login');
  await page.focus('#loginform-username');
  await page.keyboard.type(username);
  await page.focus('#loginform-password');
  await page.keyboard.type(password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForSelector('div.header-logged', { timeout: 5000 });
    console.log('Авторизация прошла успешно!');
  } catch (e) {
    console.error('Не удалось авторизоваться');
  }
  try {
    await page.waitForSelector('#w1-error-0', { timeout: 5000 });
    const errorContent = await page.$eval('#w1-error-0 div', (element) => element.innerHTML);
    const error = errorContent.replace(/\s\s+/g, ' ');
    console.error(error);
    return;
  } catch (e) {}
  const cookies = await page.cookies();
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  await page.close();
  await browser.close();
  await fs.writeFile(COOKIES_PATH, cookieString);
  return cookieString;
};

const getPageUrl = (contentId, pageNumber) =>
  `https://znanium.com/read2/page?doc=${contentId}&pgnum=${pageNumber}&currnum=${pageNumber}&readernum=${pageNumber}&rotate=0&fc=0&s=undefined`;

const fetchPagesCount = async (contentUrl, cookie) => {
  const response = await fetch(contentUrl, { headers: { Cookie: cookie } });
  const body = await response.text();
  const pagesAllText = getTextBetween(body, 'pages__all">', '<');
  const pagesCount = pagesAllText.replace(/^\D+/g, '');
  return parseInt(pagesCount);
};

const fetchPage = async (contentId, pageNumber, cookie) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  const response = await fetch(pageUrl, { headers: { Cookie: cookie } });
  const body = await response.text();
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
  return { statusText, slices };
};

(async () => {
  let cookieString = '';
  try {
    cookieString = await fs.readFile(COOKIES_PATH, 'utf-8');
    if (!cookieString) throw new Error('Cookie string is empty');
  } catch (e) {
    const { username, password } = await prompt.get(['username', 'password']);
    cookieString = await login(username, password);
    if (!cookieString) return;
  }

  const { url } = await prompt.get(['url']);
  const contentId = getTextBetween(url, 'id=', '&');

  console.log('Скачивание изображений...');
  const pagesCount = await fetchPagesCount(url, cookieString);
  const downloadProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  downloadProgress.start(pagesCount, 0);
  let error = '';
  let currentPage = 1;

  const workDir = join(DOWNLOADS_DIR, contentId);
  do {
    const { statusText, slices } = await fetchPage(contentId, currentPage, cookieString);
    if (statusText !== 'OK') {
      error = statusText;
      console.error(`Страница ${currentPage}. ${statusText}`);
    } else {
      const sliceNames = slices.map((_, i) => `page_${currentPage}_${i}.png`);
      const slicePaths = sliceNames.map((name) => join(workDir, name));
      await fs.mkdir(workDir, { recursive: true });
      for (let i = 0; i < slices.length; i++) await fs.writeFile(slicePaths[i], slices[i]);
      const image = await joinImages(slicePaths);
      image.toFile(join(workDir, `page_${currentPage}.png`));
      for (let i = 0; i < slices.length; i++) await fs.unlink(slicePaths[i]);
      downloadProgress.update(currentPage);
    }
    currentPage++;
  } while (!error);
  downloadProgress.stop();
  console.log('Скачивание завершено');

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log('Конвертирование в PDF...');
  const pdfProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  pdfProgress.start(pagesCount, 0);
  const pdfPath = join(DOWNLOADS_DIR, `${contentId}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.pipe(createWriteStream(pdfPath));
  for (let i = 1; i <= pagesCount; i++) {
    const pageImagePath = join(workDir, `page_${i}.png`);
    if (!existsSync(pageImagePath)) break;
    const pageImage = doc.openImage(pageImagePath);
    doc.addPage({ size: [pageImage.width, pageImage.height] });
    doc.image(pageImage, 0, 0);
    pdfProgress.update(i);
  }
  await fs.rm(workDir, { recursive: true, force: true });
  doc.end();

  pdfProgress.stop();
  console.log('Конвертирование завершено');
})();
