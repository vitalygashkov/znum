import { getTextBetween } from './utils.js';
import { fetch } from './http.js';
import { saveCookies } from './cookies.js';

export const fetchDocumentInfo = async (documentUrl) => {
  const response = await fetch(documentUrl);
  const body = await response.text();
  const pagesAllText = getTextBetween(body, 'pages__all">', '<');
  const pagesCount = pagesAllText.replace(/^\D+/g, '');
  const keyString = getTextBetween(body, 'id="render-ver" type="hidden" value="', '"');
  const [cryptoKey, cryptoKeyId] = keyString.split(':');
  await saveCookies();
  return { pagesCount: parseInt(pagesCount), cryptoKey, cryptoKeyId };
};

const getPageUrl = (contentId, pageNumber, format = 'svg') =>
  `https://znanium.ru/read/page?doc=${contentId}&page=${pageNumber}&current=${pageNumber}&d=&t=${format}`;

export const fetchPage = async (contentId, pageNumber, token) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  const response = await fetch(pageUrl, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.text();
  const status = getTextBetween(body, '<status>', '</status>');
  const statusText = getTextBetween(body, '<status_text>', '</status_text>');
  const svgBody = getTextBetween(body, `CDATA[<?xml`, `</svg>`);
  const svg = svgBody ? `<?xml${svgBody}</svg>` : null;
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
  await saveCookies();
  return { statusText, status, statusCode: response.status, slices, svg, body };
};
