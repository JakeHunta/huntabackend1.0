import axios from 'axios';
import { logger } from '../utils/logger.js';

const EBAY_SANDBOX_BASE_URL = 'https://api.sandbox.ebay.com/buy/browse/v1';
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN; // optional, for OAuth tokens if needed

class EbayApiService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken; // still valid
    }
    try {
      const resp = await axios.post(
        'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64'),
          },
        }
      );
      this.accessToken = resp.data.access_token;
      this.tokenExpiresAt = Date.now() + resp.data.expires_in * 1000;
      logger.info('✅ eBay API access token retrieved');
      return this.accessToken;
    } catch (error) {
      logger.error('❌ Failed to get eBay API access token:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchItems(query, limit = 10) {
    try {
      const token = await this.getAccessToken();
      const url = `${EBAY_SANDBOX_BASE_URL}/item_summary/search`;
      const params = {
        q: query,
        limit,
        // You can add filters here as needed
      };
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params,
      });

      const items = (response.data.itemSummaries || []).map(item => ({
        title: item.title,
        price: item.price.value ? `${item.price.currency} ${item.price.value}` : 'N/A',
        link: item.itemWebUrl,
        image: item.thumbnailImages?.[0]?.imageUrl || '',
        source: 'ebay_api',
      }));

      logger.info(`📦 eBay API returned ${items.length} results for "${query}"`);
      return items;

    } catch (error) {
      logger.error('❌ eBay API search error:', error.response?.data || error.message);
      return [];
    }
  }
}

export const ebayApiService = new EbayApiService();
