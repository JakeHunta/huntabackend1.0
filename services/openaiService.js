import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  async enhanceSearchQuery(query) {
    try {
      logger.info(`🤖 Enhancing query with OpenAI: "${query}"`);
      const prompt = `
        Generate a JSON object with a "search_terms" array containing 5 concise relevant search phrases to enhance the term:
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

      // Parse the JSON from response
      let enhancedQuery;
      try {
        enhancedQuery = JSON.parse(responseText);
      } catch {
        logger.warn('⚠️ Failed to parse JSON from OpenAI response, returning fallback');
        enhancedQuery = this.getFallbackEnhancement(query);
      }

      // Ensure search_terms exists and is an array
      if (!enhancedQuery || !Array.isArray(enhancedQuery.search_terms)) {
        enhancedQuery = this.getFallbackEnhancement(query);
      }

      return enhancedQuery;
    } catch (error) {
      logger.error('💥 OpenAI enhancement error:', error);
      return this.getFallbackEnhancement(query);
    }
  }

  getFallbackEnhancement(query) {
    // Simple fallback: just return original query plus some manual variants
    return {
      search_terms: [
        query,
        `${query} rare`,
        `${query} shiny`,
        `used ${query}`,
        `${query} card`,
      ],
    };
  }
}

export const openaiService = new OpenAIService();
