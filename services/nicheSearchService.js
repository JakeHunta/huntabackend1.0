import axios from 'axios';
import cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const SCRAPINGBEE_BASE_URL = 'https://app.scrapingbee.com/api/v1/';

const NICHE_MARKETPLACE_DOMAINS = [
  'cashconverters.co.uk',
  'musicmagpie.co.uk',
  'discogs.com',
  // add your niche marketplace domains here
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
  const resp = await axios.get(SCRAPINGBEE_BASE_URL, { params, timeout: 30000 });
  logger.info(`Fetched page length: ${resp.data.length} for URL: ${url}`);
  return resp.data;
}

function extractGoogleResultLinks(html) {
  const $ = cheerio.load(html);
  const urls = [];

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    // Google search links often come as "/url?q=ACTUAL_URL&sa=..."
    const match = href.match(/^\/url\?q=([^&]+)/);
    if (match) {
      const
