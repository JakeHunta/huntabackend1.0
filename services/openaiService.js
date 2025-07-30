import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.cache = new Map();
  }

  async enhanceSearchQuery(query) {
    if (this.cache.has(query)) {
      logger.info(`🤖 Returning cached OpenAI enhancement for query: "${query}"`);
      return this.cache.get(query);
    }

    try {
      logger.info(`🤖 Enhancing query with OpenAI: "${query}"`);

      const prompt = `
Generate a JSON object with a "search_terms" array containing 3 concise, highly relevant search phrases to enhance the term:
"${query}"
Return only valid JSON.
      `;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 150,
      });

      const responseText = completion.choices[0].message.content;

      let enhancedQuery;
      try {
        enhancedQuery = JSON.parse(responseText);
      } catch (parseError) {
        logger.warn('⚠️ Failed to parse JSON from OpenAI response, returning fallback');
        enhancedQuery = this.getFallbackEnhancement(query);
      }

      if (!enhancedQuery || !Array.isArray(enhancedQuery.search_terms)) {
        enhancedQuery = this.getFallbackEnhancement(query);
      }

      this.cache.set(query, enhancedQuery);
      return enhancedQuery;
    } catch (error) {
      logger.error('💥 OpenAI enhancement error:', error);
      return this.getFallbackEnhancement(query);
    }
  }

  getFallbackEnhancement(query) {
    return {
      search_terms: [
        query,
        `${query} rare`,
        `used ${query}`,
      ],
    };
  }
}

export const openaiService = new OpenAIService();
