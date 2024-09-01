import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { gotScraping } from 'got-scraping';
import { Cookie, CookieJar } from 'tough-cookie';
import prompt from 'prompt';

import { DEFAULT_URL } from './constants.js';

export const COOKIES_PATH = join(process.cwd(), 'cookies.json');
export const COOKIES = new CookieJar();

const openLoginPage = async () => {
  const response = await gotScraping('https://znanium.ru/site/login', { cookieJar: COOKIES });
  const csrfToken = getTextBetween(response.body, 'name="csrf-token" content="', '"');
  return { csrfToken };
};

const sendCredentials = async (username, password, csrfToken) => {
  return gotScraping('https://znanium.ru/site/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    cookieJar: COOKIES,
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

const openHomePage = async () => gotScraping(DEFAULT_URL, { cookieJar: COOKIES });

export const login = async (username, password) => {
  if (existsSync(COOKIES_PATH)) {
    const data = await readFile(COOKIES_PATH, 'utf-8').then((data) => JSON.parse(data));
    for (const cookie of data) await COOKIES.setCookie(Cookie.parse(cookie), DEFAULT_URL);
    return;
  }
  const answer = username && password ? { username, password } : await prompt.get(['username', 'password']);
  console.log('Авторизация...');
  const { csrfToken } = await openLoginPage();
  await sendCredentials(answer.username, answer.password, csrfToken);
  await openHomePage();
  const cookies = await COOKIES.getCookies(DEFAULT_URL).then((cookies) => cookies.map((cookie) => cookie.toString()));
  await writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  return cookies;
};
