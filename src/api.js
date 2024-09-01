import { gotScraping } from 'got-scraping';
import { getPageUrl, getTextBetween } from './utils.js';
import { COOKIES } from './auth.js';

export const fetchDocumentInfo = async (documentUrl) => {
  const response = await gotScraping(documentUrl, { cookieJar: COOKIES });
  const pagesAllText = getTextBetween(response.body, 'pages__all">', '<');
  const pagesCount = pagesAllText.replace(/^\D+/g, '');
  const keyString = getTextBetween(response.body, 'id="render-ver" type="hidden" value="', '"');
  const [cryptoKey, cryptoKeyId] = keyString.split(':');
  return { pagesCount: parseInt(pagesCount), cryptoKey, cryptoKeyId };
};

export const fetchPage = async (contentId, pageNumber, token) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  const response = await gotScraping(pageUrl, { headers: { authorization: `Bearer ${token}` }, cookieJar: COOKIES });
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
