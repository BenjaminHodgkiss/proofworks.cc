// Centralized configuration for the Proofworks codebase

const path = require('path');

// Site configuration
const SITE_URL = 'https://proofworks.cc';
const BRAND_COLOR = '#5b8a8a';

// File paths
const DOCUMENTS_PATH = path.join(__dirname, '..', 'documents.json');
const FEED_PATH = path.join(__dirname, '..', 'feed.xml');
const NEW_DOCS_PATH = path.join(__dirname, '..', 'new-documents.json');

// Document management
const ORDER_INCREMENT = 10;

// Email configuration
const EMAIL_RATE_LIMIT_MS = 250;
const EMAIL_FROM = 'Living Verification Documents <updates@proofworks.cc>';
const RESEND_API_URL = 'https://api.resend.com/emails';

// Time windows
const NEW_DOCUMENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

// RSS Feed
const FEED_TITLE = 'Living Verification Documents';
const FEED_DESCRIPTION = 'A shared collection of resources for AI verification researchers';

module.exports = {
  SITE_URL,
  BRAND_COLOR,
  DOCUMENTS_PATH,
  FEED_PATH,
  NEW_DOCS_PATH,
  ORDER_INCREMENT,
  EMAIL_RATE_LIMIT_MS,
  EMAIL_FROM,
  RESEND_API_URL,
  NEW_DOCUMENT_WINDOW_MS,
  ONE_DAY_MS,
  ONE_WEEK_MS,
  FEED_TITLE,
  FEED_DESCRIPTION
};
