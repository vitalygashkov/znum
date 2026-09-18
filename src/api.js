import { getTextBetween } from './utils.js';
import { fetch } from './http.js';
import { saveCookies } from './cookies.js';
import { createToken } from './token.js';

export class NotAuthorizedError extends Error {}

export const fetchDocumentInfo = async (documentUrl) => {
  const response = await fetch(documentUrl);
  const body = await response.text();
  const isLogged = getTextBetween(body, 'id="is-logged" type="hidden" value="', '"') === '1';
  if (!isLogged) throw new NotAuthorizedError('Нет доступа: не выполнен вход на сайт');
  const pagesCountText =
    getTextBetween(body, 'id="document-page-count" type="hidden" value="', '"') ||
    getTextBetween(body, 'pages__all">', '<').replace(/^\D+/g, '');
  const keyString = getTextBetween(body, 'id="render-ver" type="hidden" value="', '"');
  const [cryptoKey, cryptoKeyId] = keyString.split(':');
  const syncTime = getTextBetween(body, 'id="sync-time" type="hidden" value="', '"');
  const fontVariant = getTextBetween(body, 'id="font-variant" type="hidden" value="', '"');
  await saveCookies();
  return {
    pagesCount: parseInt(pagesCountText),
    cryptoKey,
    cryptoKeyId,
    syncTime,
    fontVariant,
  };
};

const getPageUrl = (contentId, pageNumber, format = 'svg') =>
  `https://znanium.ru/read/page?doc=${contentId}&page=${pageNumber}&current=${pageNumber}&d=&t=${format}`;

// Секреты обновляются сервером по ходу чтения: при ошибке авторизации (status 7)
// в ответе приходят новые render-ver (ключ) и sync-time, как это делает веб-читалка
// (renewSecretOnDemand / renewAuthorization в reader.min.js)
const renewSecret = (secret, body) => {
  let renewed = false;
  const renderVer = getTextBetween(body, '<render-ver>', '</render-ver>');
  if (renderVer) {
    const [cryptoKey, cryptoKeyId] = renderVer.split(':');
    if (cryptoKey && cryptoKeyId) {
      secret.cryptoKey = cryptoKey;
      secret.cryptoKeyId = cryptoKeyId;
      renewed = true;
    }
  }
  const syncTime = getTextBetween(body, '<sync-time>', '</sync-time>');
  if (syncTime) {
    secret.syncTime = syncTime;
    renewed = true;
  }
  return renewed;
};

export const fetchPage = async (contentId, pageNumber, secret) => {
  const pageUrl = getPageUrl(contentId, pageNumber);
  let body = '';
  let statusCode = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = createToken(contentId, pageNumber, secret.cryptoKey, secret.cryptoKeyId, {
      syncTime: secret.syncTime,
      fontVariant: secret.fontVariant,
    });
    const response = await fetch(pageUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        referer: `https://znanium.ru/read?id=${contentId}`,
      },
    });
    body = await response.text();
    statusCode = response.status;
    const status = getTextBetween(body, '<status>', '</status>');
    if (status && status !== '0') {
      if (renewSecret(secret, body)) continue;
      break;
    }
    break;
  }
  const status = getTextBetween(body, '<status>', '</status>');
  const statusText = getTextBetween(body, '<status_text>', '</status_text>');
  const svgBody = getTextBetween(body, 'CDATA[<?xml', '</svg>');
  const svg = svgBody ? `<?xml${svgBody}</svg>` : null;
  const checksum = getTextBetween(body, '<checksum>', '</checksum>');
  const cryptAlt = getTextBetween(body, '<crypt-alt>', '</crypt-alt>');
  const decryptKey = cryptAlt ? checksum : secret.cryptoKey;
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
  return { statusText, status, statusCode, slices, svg, decryptKey, body };
};
