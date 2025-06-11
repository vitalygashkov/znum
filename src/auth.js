import { input } from '@inquirer/prompts';
import { DEFAULT_URL } from './constants.js';
import { getTextBetween } from './utils.js';
import { fetch } from './http.js';
import { loadCookies, removeCookies, saveCookies } from './cookies.js';
import { args } from './args.js';

const openLoginPage = async () => {
  const response = await fetch('https://znanium.ru/site/login');
  const body = await response.text();
  const csrfToken = getTextBetween(body, 'name="csrf-token" content="', '"');
  return { csrfToken };
};

const sendCredentials = async (username, password, csrfToken) => {
  return fetch('https://znanium.ru/site/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
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

const openHomePage = async () => fetch(DEFAULT_URL);

export const login = async (username = args.values.username, password = args.values.password) => {
  const success = await loadCookies();
  if (success) return;
  const answer = { username: '', password: '' };
  if (username && password) {
    answer.username = username;
    answer.password = password;
  } else {
    answer.username = await input({ message: 'Логин' });
    answer.password = await input({ message: 'Пароль' });
  }
  console.log('Авторизация...');
  const { csrfToken } = await openLoginPage();
  await sendCredentials(answer.username, answer.password, csrfToken);
  await openHomePage();
  await saveCookies();
};

export const logout = async () => {
  await fetch('https://znanium.ru/site/logout');
  removeCookies();
};
