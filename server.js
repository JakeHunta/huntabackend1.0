import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { searchService } from './services/searchService.js';
import { nicheSearchService } from './services/nicheSearchService.js';
import { rateLimitService } from './services/rateLimitService.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://hunta.uk',
  credentials: true,
}));

app.use(express.json());

app.use(session({
  secret: process.env
