import axios from 'axios';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://app.scrapingbee.com/api/v1/';

if (!process.env.SCRAPINGBEE_API_KEY) {
  logger.warn('⚠️ SCRAPINGBEE_API_KEY not set. Scraping will fail.');
}

/**
 * Fetch a page with retries and exponential backoff on 429 rate limits.
 * Enables JS rendering to get fully rendered HTML.
 * @param {string} url
 * @param {number} maxRetries
 */
async function fetchPage(url, maxRetries = 5) {
  const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('ScrapingBee API key is not configured');
  }

  const params = {
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: true,  // <-- Enable JS rendering for dynamic content
  };

  let attempt = 0;
  const delayMs = 1000;
  const rateLimitDelayMs = 10000;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await axios.get(BASE_URL, { params, timeout: 30000 }); // 30s timeout
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

  async searchDiscogs(term) {
    const url = `https://www.discogs.com/search/?q=${encodeURIComponent(term)}&type=all`;
    logger.info(`💿 Searching Discogs for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const blocks = [...html.matchAll(/<div class="card card_large.*?<\/div>\s*<\/div>/gs)];
    return blocks.map(block => {
      const blockStr = block[0];
      const title = safeMatch(/<a[^>]*href="[^"]+"[^>]*>(.*?)<\/a>/s, blockStr);
      const linkPath = safeMatch(/href="([^"]+)"/, blockStr);
      const price = safeMatch(/£[\d,.]+/, blockStr);
      const image = safeMatch(/<img[^>]+src="([^"]+)"/, blockStr);

      if (title && linkPath && price) {
        return {
          title,
          price,
          link: `https://www.discogs.com${linkPath}`,
          image,
          source: 'discogs',
        };
      }
      logger.warn(`⚠️ Skipping incomplete Discogs item. Title: ${title}, LinkPath: ${linkPath}, Price: ${price}`);
      return null;
    }).filter(Boolean);
  }

  async searchVinted(term) {
    const url = `https://www.vinted.co.uk/catalog?search_text=${encodeURIComponent(term)}`;
    logger.info(`👗 Searching Vinted for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const blocks = [...html.matchAll(/<a class=".*?catalog-item.*?" href="([^"]+)"[^>]*>.*?<img.*?src="([^"]+)"[^>]*>.*?<div class=".*?price.*?">([^<]+)<\/div>/gs)];
    return blocks.map(match => {
      const link = `https://www.vinted.co.uk${match[1]}`;
      const image = match[2];
      const price = match[3];
      const title = link.split('/').filter(Boolean).pop()?.replace(/-/g, ' ');

      if (title && link && price) {
        return { title, price: price.trim(), link, image, source: 'vinted' };
      }
      logger.warn(`⚠️ Skipping incomplete Vinted item. Title: ${title}, Link: ${link}, Price: ${price}`);
      return null;
    }).filter(Boolean);
  }

  async searchDepop(term) {
    const url = `https://www.depop.com/search/?q=${encodeURIComponent(term)}`;
    logger.info(`🛍️ Searching Depop for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const blocks = [...html.matchAll(/<a href="\/products\/[^"]+".*?<\/a>/gs)];
    return blocks.map(block => {
      const blockStr = block[0];
      const link = safeMatch(/href="([^"]+)"/, blockStr);
      const title = safeMatch(/<div[^>]+data-testid="listing-title".*?>(.*?)<\/div>/, blockStr);
      const price = safeMatch(/£[\d,.]+/, blockStr);
      const image = safeMatch(/<img[^>]+src="([^"]+)"/, blockStr);

      if (title && price && link) {
        return { title, price, link: `https://www.depop.com${link}`, image, source: 'depop' };
      }
      logger.warn(`⚠️ Skipping incomplete Depop item. Title: ${title}, Link: ${link}, Price: ${price}`);
      return null;
    }).filter(Boolean);
  }

  async searchGumtree(term) {
    const url = `https://www.gumtree.com/search?search_category=all&q=${encodeURIComponent(term)}&distance=100`;
    logger.info(`🌳 Searching Gumtree for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const blocks = [...html.matchAll(/<a class="listing-link".*?<\/a>/gs)];
    return blocks.map(block => {
      const blockStr = block[0];
      const link = safeMatch(/href="([^"]+)"/, blockStr);
      const title = safeMatch(/<h2[^>]*>(.*?)<\/h2>/, blockStr);
      const price = safeMatch(/£[\d,.]+/, blockStr);
      const image = safeMatch(/<img[^>]+src="([^"]+)"/, blockStr);

      if (title && link && price) {
        return { title, price, link: `https://www.gumtree.com${link}`, image, source: 'gumtree' };
      }
      logger.warn(`⚠️ Skipping incomplete Gumtree item. Title: ${title}, Link: ${link}, Price: ${price}`);
      return null;
    }).filter(Boolean);
  }
}

export const scrapingService = new ScrapingService();
