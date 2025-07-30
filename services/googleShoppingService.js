import axios from 'axios';
import { logger } from '../utils/logger.js';

const RAPIDAPI_HOST = 'google-shopping-results.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_GOOGLE_SHOPPING_KEY?.trim();

class GoogleShoppingService {
  async search(term) {
    if (!RAPIDAPI_KEY) {
      logger.warn('⚠️ RAPIDAPI_GOOGLE_SHOPPING_KEY not set or empty');
      return [];
    }

    logger.info(`🔑 Using RapidAPI key starting with: ${RAPIDAPI_KEY.slice(0, 5)}...`);

    try {
      const response = await axios.get('https://google-shopping-results.p.rapidapi.com/google-search', {
        params: { query: term },
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        }
      });

      const items = response.data.results?.map(item => ({
        title: item.title,
        price: item.price?.value ? `${item.price.currency} ${item.price.value}` : 'N/A',
        link: item.link,
        image: item.image,
        source: 'google_shopping'
      })) || [];

      logger.info(`📦 Google Shopping returned ${items.length} results for "${term}"`);
      return items;

    } catch (error) {
      logger.error(`❌ Google Shopping API error: ${error.message}`);
      return [];
    }
  }
}

export const googleShoppingService = new GoogleShoppingService();
