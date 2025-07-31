import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';

const NICHE_MARKETPLACE_DOMAINS = [
  'nichesite1.com',
  'nichesite2.com',
  'nichesite3.com',
];

async function scrapeListingPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Adjust selectors here depending on your niche sites
  const title = await page.title();

  // Example selectors (change these for your niche sites)
  const price = await page.$eval('.price, .product-price, .item-price', el => el.innerText).catch(() => 'Price not found');
  const image = await page.$eval('img.product-image, img.main-image, img.primary-image', img => img.src).catch(() => null);

  return { url, title, price, image, source: url };
}

export async function searchNicheMarketplaces(searchTerm) {
  logger.info(`Starting niche search for "${searchTerm}" with Puppeteer...`);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Google search URL
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;

  await page.goto(googleSearchUrl, { waitUntil: 'networkidle2' });

  // Extract links that match your niche domains
  const links = await page.$$eval('a', (anchors, domains) => {
    return anchors
      .map(a => a.href)
      .filter(href => domains.some(domain => href.includes(domain)));
  }, NICHE_MARKETPLACE_DOMAINS);

  logger.info(`Found ${links.length} niche marketplace links on Google search`);

  const results = [];
  for (const url of links) {
    try {
      const listing = await scrapeListingPage(page, url);
      results.push(listing);
    } catch (err) {
      logger.warn(`Failed to scrape ${url}: ${err.message}`);
    }
  }

  await browser.close();
  return results;
}
