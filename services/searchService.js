import { openaiService } from './openaiService.js';
import { scrapingService } from './scrapingService.js';
import { googleShoppingService } from './googleShoppingService.js';
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

      logger.info('🕷️ Scraping marketplaces...');

      const allSearchTerms = [searchTerm, ...enhancedQuery.search_terms].slice(0, 5);

      const sources = [
        { name: 'ebay', fn: scrapingService.searchEbay },
        { name: 'discogs', fn: scrapingService.searchDiscogs },
        { name: 'vinted', fn: scrapingService.searchVinted },
        { name: 'depop', fn: scrapingService.searchDepop },
        { name: 'gumtree', fn: scrapingService.searchGumtree },
        { name: 'google_shopping', fn: googleShoppingService.search.bind(googleShoppingService) },
      ];

      let allResults = [];

      for (const term of allSearchTerms) {
        logger.info(`🔍 Searching term: "${term}"`);

        const resultsPerSource = await Promise.all(
          sources.map(async (source) => {
            try {
              const results = await source.fn(term);
              logger.info(`📦 ${source.name} returned ${results.length} results for "${term}"`);
              return results;
            } catch (err) {
              logger.warn(`⚠️ ${source.name} search failed for "${term}": ${err.message}`);
              return [];
            }
          })
        );

        allResults = allResults.concat(...resultsPerSource);

        await delay(1500);
      }

      if (allResults.length === 0) {
        logger.warn('⚠️ No results found on any marketplace');
        return [];
      }

      const uniqueResults = this.deduplicateResults(allResults);
      logger.info(`📊 Found ${uniqueResults.length} unique results`);

      const scoredResults = this.scoreResults(uniqueResults, searchTerm, enhancedQuery);

      const filtered = scoredResults
        .sort((a, b) => b.score - a.score)
        .filter(r => r.score >= 0.3)
        .slice(0, 30);

      const converted = this.convertCurrency(filtered, currency);
      logger.info(`✅ Returning ${converted.length} results`);

      return converted;

    } catch (error) {
      logger.error('💥 SearchService error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
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
