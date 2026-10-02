/**
 * SEO & Meta Tag Management
 * 
 * Manages document head meta tags for SEO, social sharing, and PWA.
 */

export interface SEOConfig {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
}

import { APP_NAME, APP_SOCIAL_TITLE } from '../../app-identity.ts';

const DEFAULT_TITLE = APP_SOCIAL_TITLE;
const DEFAULT_DESCRIPTION = 'AI flashcards powered by FSRS spaced repetition — learn anything in half the time. Turn notes and PDFs into smart decks that adapt to your memory.';
const DEFAULT_IMAGE = '/auramind/og-cover.png';
const SITE_URL = 'https://auramind.app';

/**
 * Update document meta tags for SEO
 */
export function updateMetaTags(config: SEOConfig = {}): void {
  if (typeof document === 'undefined') return;

  const title = config.title ? `${config.title} | ${APP_NAME}` : DEFAULT_TITLE;
  const description = config.description || DEFAULT_DESCRIPTION;
  const url = config.canonicalUrl || SITE_URL;
  const image = config.imageUrl || DEFAULT_IMAGE;

  // Title
  document.title = title;

  // Basic meta tags
  setMetaTag('name', 'description', description);
  setMetaTag('name', 'keywords', 'flashcards, spaced repetition, AI learning, study companion, education, memorization, SM-2, FSRS');
  setMetaTag('name', 'author', APP_NAME);
  setMetaTag('name', 'robots', config.noindex ? 'noindex, nofollow' : 'index, follow');
  setMetaTag('name', 'viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  setMetaTag('name', 'theme-color', '#3247E8');

  // Canonical URL
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  // Open Graph (Facebook, LinkedIn, Discord)
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:url', url);
  setMetaTag('property', 'og:image', image);
  setMetaTag('property', 'og:image:width', '1200');
  setMetaTag('property', 'og:image:height', '630');
  setMetaTag('property', 'og:image:alt', APP_SOCIAL_TITLE);
  setMetaTag('property', 'og:type', config.type || 'website');
  setMetaTag('property', 'og:site_name', APP_NAME);
  setMetaTag('property', 'og:locale', 'en_US');

  if (config.publishedTime) {
    setMetaTag('property', 'article:published_time', config.publishedTime);
  }
  if (config.modifiedTime) {
    setMetaTag('property', 'article:modified_time', config.modifiedTime);
  }

  // Twitter Card
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', description);
  setMetaTag('name', 'twitter:image', image);
  setMetaTag('name', 'twitter:image:alt', APP_SOCIAL_TITLE);
  setMetaTag('name', 'twitter:site', '@auramindapp');
  setMetaTag('name', 'twitter:creator', '@auramindapp');

  // PWA / Mobile
  setMetaTag('name', 'apple-mobile-web-app-capable', 'yes');
  setMetaTag('name', 'apple-mobile-web-app-status-bar-style', 'black-translucent');
  setMetaTag('name', 'apple-mobile-web-app-title', APP_NAME);
  setMetaTag('name', 'mobile-web-app-capable', 'yes');
  setMetaTag('name', 'application-name', APP_NAME);

  // Favicon
  updateFavicon();
}

function setMetaTag(attrName: string, attrValue: string, content: string): void {
  let tag = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function updateFavicon(): void {
  const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
  if (!link) return;
  // Keep the existing favicon from index.html (favicon.svg)
}

/**
 * JSON-LD Structured Data for SEO
 */
export function setJsonLd(data: Record<string, any>): void {
  if (typeof document === 'undefined') return;

  let script = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

/**
 * Default JSON-LD for AuraMind
 */
export function setDefaultJsonLd(): void {
  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: APP_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, Android',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '1250',
    },
  });
}



