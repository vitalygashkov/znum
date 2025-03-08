import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Cookie, CookieJar } from 'tough-cookie';
import { DEFAULT_URL, WORK_DIR } from './constants.js';

export const cookiePath = join(WORK_DIR, 'cookies.json');
export const cookieJar = new CookieJar();

export const loadCookies = async () => {
  if (!existsSync(cookiePath)) return false;
  const data = await readFile(cookiePath, 'utf-8').then((data) => JSON.parse(data));
  for (const cookie of data) await cookieJar.setCookie(Cookie.fromJSON(cookie), DEFAULT_URL);
  return true;
};

export const saveCookies = async () => {
  const cookies = await cookieJar
    .getCookies(DEFAULT_URL)
    .then((cookies) => cookies.map((cookie) => cookie.toJSON()));
  if (!existsSync(dirname(cookiePath))) await mkdir(dirname(cookiePath), { recursive: true });
  await writeFile(cookiePath, JSON.stringify(cookies, null, 2));
};

export const removeCookies = async () => {
  if (existsSync(cookiePath)) await unlink(cookiePath);
};
