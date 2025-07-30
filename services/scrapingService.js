import axios from 'axios';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://app.scrapingbee.com/api/v1/';

if (!process.env.SCRAPINGBEE_API_KEY) {
  logger.warn('⚠️ SCRAPINGBEE_API_KEY not set. Scraping will fail.');
}

const ENABLE_HTML_DEBUG = process.env.ENABLE_HTML_DEBUG === 'true';

/**
 * Fetch a page from ScrapingBee with retries and exponential backoff on 429.
 * Passes custom headers and optional cookies.
 * @param {string} url - Fully constructed URL to scrape
 * @param {object} options - Optional settings { maxRetries, cookies }
 * @returns {Promise<string>} - HTML content
 */
async function fetchPage(url, options = {}) {
  const { maxRetries = 5, cookies } = options;

  const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
  if (!SCRAPINGBEE_API_KEY) throw new Error('ScrapingBee API key is not configured');

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.9',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    Referer: 'https://www.ebay.co.uk/',
  };

  const params = {
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: true,
    premium_proxy: true,
  };

  if (cookies && cookies.length > 0) {
    params.cookies = JSON.stringify(cookies);
  }

  let attempt = 0;
  const baseDelay = 1000;
  const rateLimitDelay = 10000;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await axios.get(BASE_URL, {
        params,
        timeout: 30000,
      });

      if (ENABLE_HTML_DEBUG) {
        logger.info(`HTML snippet for ${url}:\n${response.data.slice(0, 1000)}\n---`);
      }

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const dataSnippet = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 500)
        : '';

      logger.warn(
        `⚠️ fetchPage attempt ${attempt} failed for URL: ${url} - Status: ${status} ${statusText} - Message: ${error.message}\nResponse snippet: ${dataSnippet}`
      );

      if (status === 429) {
        const waitTime = rateLimitDelay * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * 1000);
        const totalWait = waitTime + jitter;
        logger.warn(`⚠️ Rate limited. Waiting ${totalWait / 1000}s before retry...`);

        if (attempt > maxRetries) {
          logger.error(`❌ Max retries reached due to rate limiting for URL: ${url}`);
          throw error;
        }
        await new Promise((r) => setTimeout(r, totalWait));
      } else {
        if (attempt > maxRetries) {
          logger.error(`❌ Max retries reached for URL: ${url}`);
          throw error;
        }
        await new Promise((r) => setTimeout(r, baseDelay * attempt));
      }
    }
  }
  throw new Error('fetchPage failed after max retries');
}

function safeMatch(regex, str, group = 1) {
  try {
    const match = regex.exec(str);
    return match && match[group] ? match[group].trim() : null;
  } catch (e) {
    logger.warn(`⚠️ Regex error: ${e.message}`);
    return null;
  }
}

function buildUrl(base, params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => usp.append(k, v));
  return `${base}?${usp.toString()}`;
}

class ScrapingService {
  async searchEbay(term) {
    const url = buildUrl('https://www.ebay.co.uk/sch/i.html', {
      _nkw: term,
      _sop: '12',
    });

    logger.info(`🛒 Searching eBay for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const matches = [...html.matchAll(/<li class="s-item.*?<\/li>/gs)];
    return matches
      .map((block) => {
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
      })
      .filter(Boolean);
  }

  async searchDiscogs(term) {
    const url = buildUrl('https://www.discogs.com/search/', {
      q: term,
      type: 'all',
    });

    logger.info(`💿 Searching Discogs for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const matches = [...html.matchAll(/<div class="card card_large.*?<\/div>\s*<\/div>/gs)];
    return matches
      .map((block) => {
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
        logger.warn(
          `⚠️ Skipping incomplete Discogs item. Title: ${title}, LinkPath: ${linkPath}, Price: ${price}`
        );
        return null;
      })
      .filter(Boolean);
  }

  async searchVinted(term) {
    const url = buildUrl('https://www.vinted.co.uk/catalog', {
      search_text: term,
    });

    logger.info(`👗 Searching Vinted for: "${term}"`);
    // Optional cookies for logged-in sessions
    const cookies = [
      // { name: 'sessionid', value: process.env.VINTED_SESSION_ID, domain: '.vinted.co.uk' },
    ];

    const html = await fetchPage(url, { cookies });
    if (!html) return [];

    const matches = [...html.matchAll(/<a class=".*?catalog-item.*?" href="([^"]+)"[^>]*>.*?<img.*?src="([^"]+)"[^>]*>.*?<div class=".*?price.*?">([^<]+)<\/div>/gs)];
    return matches
      .map((match) => {
        const link = `https://www.vinted.co.uk${match[1]}`;
        const image = match[2];
        const price = match[3];
        const title = link.split('/').filter(Boolean).pop()?.replace(/-/g, ' ');

        if (title && link && price) {
          return { title, price: price.trim(), link, image, source: 'vinted' };
        }
        logger.warn(`⚠️ Skipping incomplete Vinted item. Title: ${title}, Link: ${link}, Price: ${price}`);
        return null;
      })
      .filter(Boolean);
  }

  async searchDepop(term) {
    const url = buildUrl('https://www.depop.com/search/', { q: term });

    logger.info(`🛍️ Searching Depop for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const matches = [...html.matchAll(/<a href="\/products\/[^"]+".*?<\/a>/gs)];
    return matches
      .map((block) => {
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
      })
      .filter(Boolean);
  }

  async searchGumtree(term) {
    const url = buildUrl('https://www.gumtree.com/search', {
      search_category: 'all',
      q: term,
      distance: '100',
    });

    logger.info(`🌳 Searching Gumtree for: "${term}"`);
    const html = await fetchPage(url);
    if (!html) return [];

    const matches = [...html.matchAll(/<a class="listing-link".*?<\/a>/gs)];
    return matches
      .map((block) => {
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
      })
      .filter(Boolean);
  }
}

export const scrapingService = new ScrapingService();
