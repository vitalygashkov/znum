import { parseArgs } from 'node:util';

export const args = parseArgs({
  allowPositionals: true,
  options: {
    link: {
      short: 'l',
      type: 'string',
    },
    username: {
      short: 'u',
      type: 'string',
    },
    password: {
      short: 'p',
      type: 'string',
    },
  },
});
