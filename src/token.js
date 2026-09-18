import { createHmac } from 'node:crypto';

export const createToken = (
  documentId,
  pageNumber,
  cryptoKey,
  cryptoKeyId,
  { syncTime, fontVariant } = {}
) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const serverTime = syncTime ? parseInt(syncTime, 10) : timestamp;
  const timeSyncDelta = timestamp - serverTime;
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
    case: 0,
    readerToken: '',
    readerType: 'svg',
    purpose: 'reader',
    fv: fontVariant || null,
    debug: '0',
  };
  const bodyString = Buffer.from(JSON.stringify(body)).toString('base64');
  const hmac = createHmac('sha256', key);
  hmac.update(`${headerString}.${bodyString}`);
  const hashString = hmac.digest('base64');
  const lastJwt = `${headerString}.${bodyString}.${hashString}`;
  return lastJwt;
};
