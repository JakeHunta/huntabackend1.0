import axios from 'axios';
import cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const SCRAPINGBEE_BASE_URL = 'https://app.scrapingbee.com/api/v1/';

const NICHE_MARKETPLACE_DOMAINS = [
  'cashconverters.co.uk',
  'cashconverters.com.au',
  // add other niche domains here
];

async function fetchPage(url) {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('ScrapingBee API key missing');
  }
  const params = {
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: true,
    premium_proxy: true,
  };
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36',
  };
  const resp = await axios.get(SCRAPINGBEE_BASE_URL, { params, headers, timeout: 30000 });
  logger.info(`Fetched page length: ${resp.data.length} for URL: ${url}`);
  return resp.data;
}

function extractGoogleResultLinks(html) {
  const urls = [];
  const regex = /<a href="\/url\?q=([^"&]+)&amp;/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    if (NICHE_MARKETPLACE_DOMAINS.some(domain => url.includes(domain))) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

async function scrapeCashConvertersListing(html, url) {
  const $ = cheerio.load(html);

  const title = $('h1.product-title').text().trim() || 'No title found';
  let price = $('span.price').first().text().trim() || 'Price not found';

  if (!price.startsWith('£')) {
    const priceMatch = price.match(/[\d,.]+/);
    if (priceMatch) price = '£' + priceMatch[0];
  }

  const image = $('img.product-main-image').attr('src') || null;

  return { url, title, price, image, source: 'cashconverters' };
}

async function scrapeListingPage(url) {
  const html = await fetchPage(url);

  if (url.includes('cashconverters.co.uk')) {
    return scrapeCashConvertersListing(html, url);
  }

  // generic fallback
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'No title found';

  const priceMatch = html.match(/£[\d,.]+/);
  const price = priceMatch ? priceMatch[0] : 'Price not found';

  const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*product-image[^"]*"/i) 
    || html.match(/<img[^>]+src="([^"]+)"[^>]*alt="[^"]*product[^"]*"/i);
  const image = imgMatch ? imgMatch[1] : null;

  return { url, title, price, image, source: url };
}

export async function searchNicheMarketplaces(searchTerm) {
  logger.info(`Starting niche search for "${searchTerm}" on Google...`);
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;

  const googleHtml = await fetchPage(googleSearchUrl);
  const listingUrls = extractGoogleResultLinks(googleHtml);

  logger.info(`Found ${listingUrls.length} niche marketplace links from Google`);

  const results = [];
  for (const url of listingUrls) {
    try {
      const listing = await scrapeListingPage(url);
      results.push(listing);
    } catch (err) {
      logger.warn(`Failed to scrape ${url}: ${err.message}`);
    }
  }
  return results;
}
