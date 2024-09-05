import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_URL = 'https://znanium.ru/';
export const DELAY_BETWEEN_REQUESTS = 1 * 1000; // 1 секунда
export const DOWNLOADS_DIR = join(homedir(), 'Downloads');
export const WORK_DIR = join(DOWNLOADS_DIR, 'znum');
