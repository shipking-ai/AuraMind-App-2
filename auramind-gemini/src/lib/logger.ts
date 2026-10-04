const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console -- logging utility
      console.debug('[BonaMind]', ...args);
    }
  },
  log: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console -- logging utility
      console.log('[BonaMind]', ...args);
    }
  },
  info: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console -- logging utility
      console.info('[BonaMind]', ...args);
    }
  },
  warn: (...args: unknown[]): void => {
    console.warn('[BonaMind]', ...args);
  },
  error: (...args: unknown[]): void => {
    console.error('[BonaMind]', ...args);
  }
};

export default logger;
