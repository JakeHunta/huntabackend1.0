// utils/logger.js

export const logger = {
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.warn('[WARN]', msg, ...args),
  error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
  debug: (msg, ...args) => {
    if (process.env.NODE_ENV === 'production') return; // optionally disable debug in prod
    if (console.debug) {
      console.debug('[DEBUG]', msg, ...args);
    } else {
      console.log('[DEBUG]', msg, ...args);
    }
  },
};
