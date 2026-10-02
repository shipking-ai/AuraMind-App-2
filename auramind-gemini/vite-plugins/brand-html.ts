import type { Plugin } from 'vite';
import {
  APP_NAME,
  APP_DESCRIPTION,
  APP_SOCIAL_TITLE,
} from '../app-identity.ts';

/**
 * Rewrites the product name in index.html at build time.
 *
 * index.html is static HTML — it cannot import app-identity.ts, which is why
 * the name used to be typed into <title> and the meta tags by hand. Leaving
 * them as literal text means a rename that touches the TypeScript but forgets
 * the HTML ships a build whose tab title still reads the old name.
 *
 * Two element shapes are rewritten, and they need different handling:
 *
 *   <title data-brand="title">…</title>            → text node
 *   <meta data-brand="og:title" content="…" />     → attribute value
 *
 * For the <meta> case we match the `content` attribute *within* the tag that
 * carries our data-brand marker. Matching the whole element and re-emitting it
 * does not work: an opening tag ends at `>`, so a naive replacement appends
 * the new value after the tag's own attributes and duplicates the string in
 * the output.
 *
 * Every rewritten tag carries `data-brand="<key>"`, and this plugin throws if
 * any key is missing. A missing tag is a hard build failure rather than a
 * silent no-op, so a future edit to index.html cannot quietly detach a field
 * from the rename pipeline.
 */

/** Keys we drive, and where each one goes in the output. */
const FIELDS = [
  // <title> holds its value as a text node.
  { key: 'title', value: () => APP_SOCIAL_TITLE, kind: 'text' as const },
  // Every other entry is a <meta>, whose value lives in content="".
  { key: 'description', value: () => APP_DESCRIPTION, kind: 'attr' as const },
  { key: 'author', value: () => APP_NAME, kind: 'attr' as const },
  { key: 'og:title', value: () => APP_SOCIAL_TITLE, kind: 'attr' as const },
  { key: 'twitter:title', value: () => APP_SOCIAL_TITLE, kind: 'attr' as const },
];

function escapeAttr(value: string): string {
  // `&` first so an already-escaped entity in the name is not double-processed.
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Replace the text node of the element carrying data-brand="<key>". */
function substituteText(html: string, key: string, value: string): string {
  const re = new RegExp(`(data-brand=["']${escapeRegExp(key)}["'][^>]*>)([\\s\\S]*?)(<)`, 'i');
  if (!re.test(html)) {
    throw new Error(
      `[brand-html] Could not find a text node for data-brand="${key}" in index.html. ` +
        `Every brand-driven tag must carry data-brand so the rename pipeline can ` +
        `find it. Restore the tag or remove it from FIELDS.`,
    );
  }
  return html.replace(re, `$1${value}$3`);
}

/** Replace the content="..." value of the meta carrying data-brand="<key>". */
function substituteAttr(html: string, key: string, value: string): string {
  const marker = new RegExp(`(<[^>]*data-brand=["']${escapeRegExp(key)}["'][^>]*?content=["'])([\\s\\S]*?)(["'])`, 'i');
  if (!marker.test(html)) {
    throw new Error(
      `[brand-html] Could not find content="..." for data-brand="${key}" in index.html. ` +
        `A meta tag driven by the rename pipeline must have both a data-brand ` +
        `marker and a content attribute.`,
    );
  }
  return html.replace(marker, `$1${escapeAttr(value)}$3`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function brandHtml(): Plugin {
  return {
    name: 'brand-html',
    transformIndexHtml: {
      // 'pre' so the values land before vite-plugin-pwa injects the manifest
      // link into the same HTML.
      order: 'pre',
      handler(html) {
        let out = html;
        for (const field of FIELDS) {
          const value = field.value();
          out = field.kind === 'text'
            ? substituteText(out, field.key, value)
            : substituteAttr(out, field.key, value);
        }
        return out;
      },
    },
  };
}