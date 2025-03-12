import { homedir } from 'node:os';
import { join } from 'node:path';
import { args } from './args.js';

export const DEFAULT_URL = 'https://znanium.ru/';
export const DELAY_BETWEEN_REQUESTS = Number(args.values.delay) * 1000; // 1 секунда
export const REQUEST_TIMEOUT = 3 * 60 * 1000; // 3 минуты
export const DOWNLOADS_DIR = join(homedir(), 'Downloads');
export const WORK_DIR = join(DOWNLOADS_DIR, 'znum');
