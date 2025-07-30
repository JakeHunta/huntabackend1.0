import axios from 'axios';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://app.scrapingbee.com/api/v1/';

if (!process.env.SCRAPINGBEE_API_KEY) {
  logger.warn('⚠️ SCRAPINGBEE_API_KEY not set. Scraping will fail.');
}

async function fetchPage(url, options = {}) {
  const { maxRetries = 5, cookies } = options;
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
  };

  if (cookies) {
    params.cookies = JSON.stringify(cookies);
  }

  let attempt = 0;
  const delayMs = 1000;
  const rateLimitDelayMs = 10000;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await axios.get(BASE_URL, { params, timeout: 30000 });
      logger.info(`✅ fetchPage success for URL: ${url}, length: ${response.data.length}`);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const snippet = error.response?.data ? JSON.stringify(error.response.data).slice(0, 200) : '';

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
        logger.warn(`⚠️ fetchPage attempt ${attempt} failed for URL: ${url} - Status: ${status} - Message: ${error.message}`);
        if (snippet) logger.warn(`Response snippet: ${snippet}`);
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

function buildMarketplaceUrl(base, queryParams) {
  const params = new URLSearchParams();
  for (const key in queryParams) {
    params.append(key, queryParams[key]);
  }
  return `${base}?${params.toString()}`;
}

class ScrapingService {
  async searchEbay(term) {
    const url = buildMarketplaceUrl('https://www.ebay.co.uk/sch/i.html', {
      _nkw: term,
      _sop: '12',
    });
    logger.info(`🛒 Searching eBay for: "${term}"`);
    const html = await fetchPage(url);
    async searchEbay(term) {
  const url = buildMarketplaceUrl('https://www.ebay.co.uk/sch/i.html', {
    _nkw: term,
    _sop: '12',
  });

  logger.info(`🛒 Searching eBay for: "${term}"`);
  const html = await fetchPage(url);

  if (!html) {
    logger.warn('⚠️ fetchPage returned empty HTML');
    return [];
  }

  // DEBUG LOGGING: show HTML length and first 1k chars (truncate for logs)
  logger.info(`📝 Fetched eBay HTML length: ${html.length}`);
  logger.info(`📝 eBay HTML snippet:\n${html.slice(0, 1000).replace(/\n/g, ' ')}`);

  // Existing parsing logic
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

  logger.info(`📦 Parsed ${items.length} eBay items for "${term}"`);

  return items;
}


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

  // You can add more marketplaces similarly, but let's keep it simple for now
}

export const scrapingService = new ScrapingService();
