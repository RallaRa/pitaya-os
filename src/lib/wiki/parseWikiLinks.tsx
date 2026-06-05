'use client';

import type { ReactNode } from 'react';

/** [[slug|title]] 또는 [[title]] (title을 slug로도 사용) */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikiSlugs(text: string): string[] {
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKI_LINK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const slug = m[2]
      ? m[2].trim()
      : m[1].trim().replace(/\s+/g, '-').toLowerCase();
    slugs.push(slug);
  }
  return [...new Set(slugs)];
}

export function renderWikiLinkedText(
  text: string,
  onLinkClick: (slug: string) => void,
  slugTitleMap?: Record<string, string>,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(WIKI_LINK_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    const slug = match[2]
      ? match[2].trim()
      : match[1].trim().replace(/\s+/g, '-').toLowerCase();
    const label = match[2] ? match[1].trim() : (slugTitleMap?.[slug] || match[1].trim());
    parts.push(
      <button
        key={key++}
        type="button"
        onClick={() => onLinkClick(slug)}
        className="text-teal-400 hover:text-teal-300 underline underline-offset-2 font-medium"
      >
        {label}
      </button>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }
  return parts.length ? parts : [text];
}
