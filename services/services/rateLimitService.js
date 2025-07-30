import NodeCache from 'node-cache';
import { logger } from '../utils/logger.js';

class RateLimitService {
  constructor() {
    this.dailyCache = new NodeCache({ stdTTL: 86400 });
    this.freeSearchLimit = 1; // set your free daily limit here
  }

  async checkDailyLimit(userIdentifier, isSubscribed = false) {
    if (isSubscribed) {
      return { allowed: true, remaining: 'unlimited', resetTime: null };
    }

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily_${userIdentifier}_${today}`;
    let count = this.dailyCache.get(cacheKey) || 0;

    if (count >= this.freeSearchLimit) {
      return { allowed: false, remaining: 0, resetTime: this.getResetTime() };
    }

    this.dailyCache.set(cacheKey, count + 1);
    return {
      allowed: true,
      remaining: this.freeSearchLimit - (count + 1),
      resetTime: this.getResetTime(),
    };
  }

  getResetTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }
}

export const rateLimitService = new RateLimitService();
