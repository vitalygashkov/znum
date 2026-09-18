import { input } from '@inquirer/prompts';
import { DEFAULT_URL } from './constants.js';
import { getTextBetween } from './utils.js';
import { fetch } from './http.js';
import { loadCookies, removeCookies, saveCookies } from './cookies.js';
import { args } from './args.js';

export class LoginError extends Error {}

// Форма логина переехала на /site/login?ret=1: POST принимает только по action
// из самой формы, иначе сессия не выдаётся и загрузка идёт как аноним
const openLoginPage = async () => {
  const response = await fetch('https://znanium.ru/site/login');
  const body = await response.text();
  const csrfToken = getTextBetween(body, 'name="csrf-token" content="', '"');
  const formAction = getTextBetween(body, '<form id="login-form" action="', '"');
  const loginUrl = new URL(formAction || '/site/login', DEFAULT_URL);
  // Не отправляем учётные данные на сторонний origin, даже если action подменён
  if (loginUrl.origin !== new URL(DEFAULT_URL).origin) {
    throw new LoginError('Форма входа указывает на сторонний адрес, отмена авторизации');
  }
  return { csrfToken, loginUrl: loginUrl.toString() };
};

const sendCredentials = async (username, password, csrfToken, loginUrl) => {
  return fetch(loginUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      '_csrf-frontend': csrfToken,
      'LoginForm[username]': username,
      'LoginForm[password]': password,
      'LoginForm[rememberMe]': '1',
      'LoginForm[returnUrl]': '',
      did: '',
      pid: '',
      page: '',
      'login-button': '',
    }).toString(),
  });
};

const promptCredentials = async (username, password) => {
  const answer = { username: '', password: '' };
  if (username && password) {
    answer.username = username;
    answer.password = password;
  } else {
    answer.username = await input({ message: 'Логин' });
    answer.password = await input({ message: 'Пароль' });
  }
  return answer;
};

export const login = async (username = args.values.username, password = args.values.password) => {
  const success = await loadCookies();
  if (success) return;
  const answer = await promptCredentials(username, password);
  console.log('Авторизация...');
  const { csrfToken, loginUrl } = await openLoginPage();
  const response = await sendCredentials(answer.username, answer.password, csrfToken, loginUrl);
  const body = await response.text();
  if (String(response.url).includes('/site/login')) {
    const error = getTextBetween(body, 'help-block help-block-error">', '</p>')?.trim();
    await removeCookies();
    throw new LoginError(error || 'Не удалось авторизоваться: проверь логин и пароль');
  }
  await saveCookies();
};

export const logout = async () => {
  await fetch('https://znanium.ru/site/logout');
  removeCookies();
};
