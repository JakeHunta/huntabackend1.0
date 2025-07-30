# Hunta Backend API

## Overview

This is the backend API for the Hunta multi-marketplace search tool. It scrapes marketplaces like eBay, Discogs, Vinted, Depop, Gumtree and enhances queries using OpenAI.

## Environment Variables

Create a `.env` file or configure the following on your hosting platform:

OPENAI_API_KEY=your_openai_api_key
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key
SESSION_SECRET=your_random_session_secret
STRIPE_SECRET_KEY=your_stripe_secret_key (optional)
STRIPE_PRO_PRICE_ID=your_stripe_price_id (optional)
NODE_ENV=production
PORT=3000

## Running Locally

```bash
npm install
npm run dev
