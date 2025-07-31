import { openaiService } from './openaiService.js';
import { ebayApiService } from './ebayApiService.js'; // your official eBay API wrapper service
import { googleShoppingService } from './googleShoppingService.js'; // your RapidAPI Google Shopping service
import { logger } from '../utils/logger.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class SearchService {
  constructor() {
    this.lastEnhancedQuery = null;
  }

  async performSearch(searchTerm, location = 'UK', currency = 'GBP') {
    try {
      logger.info(`🔍 Starting search for: "${searchTerm}" in ${location} with ${currency}`);

      // Enhance query with OpenAI and validate response
      let enhancedQuery = { search_terms: [] };
      try {
        logger.info('🤖 Enhancing search query with OpenAI...');
        enhancedQuery = await openaiService.enhanceSearchQuery(searchTerm);
        if (!enhancedQuery || !Array.isArray(enhancedQuery.search_terms)) {
          logger.warn('⚠️ OpenAI response invalid format, using empty search terms');
          enhancedQuery = { search_terms: [] };
        }
        this.lastEnhancedQuery = enhancedQuery;
      } catch (error) {
        logger.warn('⚠️ OpenAI enhancement failed, using fallback:', error.message);
        enhancedQuery = openaiService.getFallbackEnhancement(searchTerm);
        if (!enhancedQuery || !Array.isArray(enhancedQuery.search_terms)) {
          enhancedQuery = { search_terms: [] };
        }
        this.lastEnhancedQuery = enhancedQuery;
      }

      logger.info('🕷️ Searching marketplaces...');

      // Limit to 5 search terms max (original + enhanced)
      const allSearchTerms = [searchTerm, ...enhancedQuery.search_terms].slice(0, 5);

      let allResults = [];

      for (const term of allSearchTerms) {
        logger.info(`🔍 Searching term: "${term}"`);

        // Search eBay official API
        try {
          const ebayResults = await ebayApiService.search(term, location, currency);
          logger.info(`📦 eBay API returned ${ebayResults.length} results for "${term}"`);
          allResults = allResults.concat(ebayResults);
        } catch (err) {
          logger.warn(`⚠️ eBay API search failed for "${term}": ${err.message}`);
        }

        // Search Google Shopping API with retry on rate limit
        try {
          const googleResults = await this.tryGoogleShoppingSearch(term);
          logger.info(`📦 Google Shopping returned ${googleResults.length} results for "${term}"`);
          allResults = allResults.concat(googleResults);
        } catch (err) {
          logger.warn(`⚠️ Google Shopping search failed for "${term}": ${err.message}`);
        }

        // Delay between search terms to avoid API rate limits
        await delay(1500);
      }

      if (allResults.length === 0) {
        logger.warn('⚠️ No results found on any marketplace');
        return [];
      }

      // Deduplicate results by normalized title and price
      const uniqueResults = this.deduplicateResults(allResults);
      logger.info(`📊 Found ${uniqueResults.length} unique results`);

      // Score results
      const scoredResults = this.scoreResults(uniqueResults, searchTerm, enhancedQuery);

      // Filter & sort by score (threshold 0.3)
      const filtered = scoredResults
        .sort((a, b) => b.score - a.score)
        .filter(r => r.score >= 0.3)
        .slice(0, 30);

      // Convert price format/currency symbols
      const converted = this.convertCurrency(filtered, currency);
      logger.info(`✅ Returning ${converted.length} results`);

      return converted;

    } catch (error) {
      logger.error('💥 SearchService error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async tryGoogleShoppingSearch(term, retries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await googleShoppingService.search(term);
      } catch (error) {
        if (error.response?.status === 429 && attempt < retries) {
          logger.warn(`⚠️ Google Shopping API rate limited. Retrying attempt ${attempt}/${retries} after ${delayMs}ms`);
          await delay(delayMs);
          delayMs *= 2; // exponential backoff
        } else {
          throw error;
        }
      }
    }
    return [];
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      if (!result.title || !result.price || !result.link) return false;
      const key = `${result.title.toLowerCase().trim().replace(/\s+/g, ' ')}-${result.price.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  scoreResults(results, originalQuery, enhancedQuery) {
    const queryTerms = originalQuery.toLowerCase().split(/\s+/);
    const enhancedTerms = enhancedQuery.search_terms.map(t => t.toLowerCase());

    return results.map(result => {
      const title = (result.title || '').toLowerCase();
      const description = (result.description || '').toLowerCase();
      let score = 0.05;

      queryTerms.forEach(term => {
        if (title.includes(term)) score += 0.3;
        if (description.includes(term)) score += 0.1;
      });

      enhancedTerms.forEach(term => {
        if (title.includes(term)) score += 0.2;
        if (description.includes(term)) score += 0.05;
      });

      if (title.includes(originalQuery.toLowerCase())) score += 0.4;
      if (result.image) score += 0.05;
      if (result.title.length < 20) score -= 0.2;
      if (result.source === 'ebay') score += 0.1;

      score = Math.min(1, Math.max(0, score));
      return { ...result, score: Math.round(score * 100) / 100 };
    });
  }

  convertCurrency(results, targetCurrency) {
    const symbols = { GBP: '£', USD: '$', EUR: '€' };
    const symbol = symbols[targetCurrency] || '';

    return results
      .filter(r => {
        const p = r.price || '';
        if (targetCurrency === 'GBP') return p.includes('£') || (!p.includes('$') && !p.includes('€') && /\d/.test(p));
        return p.includes(symbol);
      })
      .map(r => ({ ...r, price: this.ensureCurrencyFormat(r.price, symbol) }));
  }

  ensureCurrencyFormat(price, symbol) {
    if (!price) return price;
    if (price.includes(symbol)) return price;
    const numberMatch = price.match(/[\d,]+(?:\.\d{2})?/);
    if (numberMatch && !/[£$€]/.test(price)) {
      return `${symbol}${numberMatch[0]}`;
    }
    return price;
  }

  getLastEnhancedQuery() {
    return this.lastEnhancedQuery;
  }
}

export const searchService = new SearchService();
