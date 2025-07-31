import axios from 'axios';
import { logger } from '../utils/logger.js';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const SCRAPINGBEE_BASE_URL = 'https://app.scrapingbee.com/api/v1/';

// List of allowed niche marketplace domains
const NICHE_MARKETPLACE_DOMAINS = [
  'cashconverters.co.uk',
  'example-niche-site.com',
  // add more niche domains here
];

async function fetchPage(url) {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('ScrapingBee API key missing');
  }
  const params = {
    api_key: SCRAPINGBEE_API_KEY,
    url,
    render_js: true,   // enable JS rendering for dynamic sites
    premium_proxy: true,
  };
  const response = await axios.get(SCRAPINGBEE_BASE_URL, { params, timeout: 30000 });
  logger.info(`Fetched page length: ${response.data.length} for URL: ${url}`);
  return response.data;
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
  return [...new Set(urls)]; // deduplicate
}

async function scrapeListingPage(url) {
  const html = await fetchPage(url);

  // Basic parsing example — adjust for your niche sites
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'No title found';

  const priceMatch = html.match(/£[\d,.]+/);
  const price = priceMatch ? priceMatch[0] : 'Price not found';

  // Try to find product image by common attributes
  const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*(?:class="[^"]*product-image[^"]*"|alt="[^"]*product[^"]*")/i);
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
