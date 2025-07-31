import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { searchService } from './services/searchService.js';
import { rateLimitService } from './services/rateLimitService.js';
import { searchNicheMarketplaces } from './services/nicheSearchService.js';  // <-- Import your niche search service

const app = express();
const PORT = process.env.PORT || 3000;

// CORS config — allow your frontend domain
app.use(cors({
  origin: 'https://hunta.uk',
  credentials: true,
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'default-session-secret-change-me',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      scrapingbee: process.env.SCRAPINGBEE_API_KEY ? 'configured' : 'missing',
    }
  });
});

// Standard search endpoint
app.post('/search', async (req, res) => {
  try {
    const { search_term, location = 'UK', currency = 'GBP' } = req.body;

    if (!search_term || typeof search_term !== 'string') {
      return res.status(400).json({ error: 'Invalid search term' });
    }

    const userIdentifier = req.sessionID || req.ip || 'anonymous';
    const isSubscribed = false; // TODO: Implement your auth & subscription logic

    const rateLimit = await rateLimitService.checkDailyLimit(userIdentifier, isSubscribed);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Daily limit exceeded',
        resetTime: rateLimit.resetTime,
        upgradeUrl: '/api/create-checkout-session'
      });
    }

    const results = await searchService.performSearch(search_term.trim(), location.trim(), currency);

    res.json({
      listings: results,
      searchesRemaining: rateLimit.remaining,
      resetTime: rateLimit.resetTime,
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// Niche marketplace search endpoint
app.post('/search-niche', async (req, res) => {
  const { search_term } = req.body;
  if (!search_term || typeof search_term !== 'string') {
    return res.status(400).json({ error: 'Invalid search term' });
  }

  try {
    const listings = await searchNicheMarketplaces(search_term.trim());
    res.json({ listings });
  } catch (error) {
    console.error('Niche search error:', error);
    res.status(500).json({ error: 'Niche search failed', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Hunta backend running on port ${PORT}`);
});
