import { createHmac } from 'node:crypto';

export const createToken = (documentId, pageNumber, cryptoKey, cryptoKeyId, t) => {
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
};
