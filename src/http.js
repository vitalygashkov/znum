import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gotScraping } from 'got-scraping';
import { Cookie, CookieJar } from 'tough-cookie';
import { DEFAULT_URL } from './constants.js';

export const cookiePath = join(process.cwd(), 'cookies.json');
export const cookieJar = new CookieJar();

export const loadCookies = async () => {
  if (!existsSync(cookiePath)) return false;
  const data = await readFile(cookiePath, 'utf-8').then((data) => JSON.parse(data));
  for (const cookie of data) await cookieJar.setCookie(Cookie.parse(cookie), DEFAULT_URL);
  return true;
};

export const saveCookies = async () => {
  console.log(cookieJar.toJSON());
  const cookies = await cookieJar.getCookies(DEFAULT_URL).then((cookies) => cookies.map((cookie) => cookie.toString()));
  await writeFile(cookiePath, JSON.stringify(cookies, null, 2));
};

export const fetch = async (resource, options) => {
  const response = await gotScraping({
    url: resource,
    // useHeaderGenerator: true,
    // headerGeneratorOptions: {
    //   browserListQuery: 'last 2 Chrome versions',
    //   operatingSystems: [process.platform === 'win32' ? 'windows' : 'macos'],
    // },
    // http2: true,
    cookieJar,
    ...options,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (!value || typeof value !== 'string') continue;
    headers.append(key, value);
  }
  for (const cookie of response.headers['set-cookie'] || []) headers.append('set-cookie', cookie);
  return new Response(response.rawBody, {
    headers: headers,
    status: response.statusCode,
  });
};
