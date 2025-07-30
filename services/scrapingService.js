import axios from 'axios';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://app.scrapingbee.com/api/v1/';

if (!process.env.SCRAPINGBEE_API_KEY) {
  logger.warn('⚠️ SCRAPINGBEE_API_KEY not set. Scraping will fail.');
}

/**
 * Fetch a page with retries and exponential backoff on 429 rate limits.
 * Enables JS rendering and uses premium proxies.
 * Passes custom headers to mimic a real browser.
 * @param {string} url
 * @param {object} options Optional. { maxRetries: number }
 */
async function fetchPage(url, options = {}) {
  const { maxRetries = 5 } = options;
  const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('ScrapingBee API key is not configured');
  }

  const customHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/115.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://www.ebay.co.uk/',
  };

  const params = {
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: true,
    premium_proxy: true,
    headers: JSON.stringify(customHeaders),
  };

  let attempt = 0;
  const delayMs = 1000;
  const rateLimitDelayMs = 10000;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await axios.get(BASE_URL, { params, timeout: 30000 });
      logger.debug(`✅ fetchPage success for URL: ${url}, length: ${response.data.length}`);
      return response.data;
    } catch (error) {
      const status = error.response?.status;

      if (status === 429) {
        const waitTime = rateLimitDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 1000);
        const totalWait = waitTime + jitter;
        logger.warn(`⚠️ fetchPage attempt ${attempt} rate limited for URL: ${url} - waiting ${totalWait / 1000}s`);
        if (attempt > maxRetries) {
          logger.error(`❌ fetchPage max retries reached due to rate limiting for URL: ${url}`);
          throw error;
        }
        await new Promise(r => setTimeout(r, totalWait));
      } else {
        logger.warn(`⚠️ fetchPage attempt ${attempt} failed for URL: ${url} - ${error.message}`);
        if (attempt > maxRetries) {
          logger.error(`❌ fetchPage max retries reached for URL: ${url}`);
          throw error;
        }
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw new Error('fetchPage failed after max retries');
}

function safeMatch(regex, str, group = 1) {
  const match = regex.exec(str);
  return match && match[group] ? match[group].trim() : null;
}

class ScrapingService {
  async searchEbay(term) {
    const url = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(term)}&_sop=12`;
    logger.info(`🛒 Searching eBay for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const items = [...html.matchAll(/<li class="s-item.*?<\/li>/gs)].map(block => {
      const blockStr = block[0];
      const title = safeMatch(/<h3[^>]*>(.*?)<\/h3>/, blockStr);
      const link = safeMatch(/href="(https:\/\/www\.ebay\.co\.uk\/itm\/[^"]+)"/, blockStr);
      const price = safeMatch(/£[\d,.]+/, blockStr);
      const image = safeMatch(/<img[^>]+src="([^"]+)"/, blockStr);

      if (title && link && price) {
        return { title, price, link, image, source: 'ebay' };
      }
      logger.warn(`⚠️ Skipping incomplete eBay item. Title: ${title}, Link: ${link}, Price: ${price}`);
      return null;
    }).filter(Boolean);

    return items;
  }
}

export const scrapingService = new ScrapingService();
