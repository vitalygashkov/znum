import { gotScraping } from 'got-scraping';
import { cookieJar } from './cookies.js';
import { REQUEST_TIMEOUT } from './constants.js';

const parseHeaders = (response) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (!value || typeof value !== 'string') continue;
    headers.append(key, value);
  }
  for (const cookie of response.headers['set-cookie'] || []) headers.append('set-cookie', cookie);
  return headers;
};

const fetchViaGot = async (resource, options = {}) => {
  const response = await gotScraping({
    url: resource,
    useHeaderGenerator: true,
    headerGeneratorOptions: {
      browserListQuery: 'last 2 Chrome versions',
      operatingSystems: [process.platform === 'win32' ? 'windows' : 'macos'],
    },
    http2: true,
    timeout: { request: REQUEST_TIMEOUT },
    retry: {
      limit: 5,
      methods: ['GET', 'POST'],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
    cookieJar,
    ...options,
  });
  const headers = parseHeaders(response);
  const status = response.statusCode;
  return new Response(response.rawBody, { headers, status });
};

export const fetch = fetchViaGot;
