'use client';

import React from 'react';
import Link from 'next/link';
import { renderWikiLinkedText } from '@/lib/wiki/parseWikiLinks';

interface WikiMarkdownProps {
  content: string;
  onWikiLink?: (slug: string) => void;
  slugTitleMap?: Record<string, string>;
}

function renderInline(
  line: string,
  onWikiLink?: (slug: string) => void,
  slugTitleMap?: Record<string, string>,
): React.ReactNode {
  if (!onWikiLink) {
    return line;
  }
  return <>{renderWikiLinkedText(line, onWikiLink, slugTitleMap)}</>;
}

export default function WikiMarkdown({
  content,
  onWikiLink,
  slugTitleMap,
}: WikiMarkdownProps) {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      nodes.push(
        <pre key={key++} className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto my-3">
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()))
        .map(r => r.split('|').slice(1, -1).map(c => c.trim()));
      nodes.push(
        <div key={key++} className="overflow-x-auto my-3">
          <table className="w-full text-sm border border-slate-700 rounded-lg overflow-hidden">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-slate-800 font-semibold text-slate-200' : 'border-t border-slate-700 text-slate-300'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={key++} className="text-base font-bold text-white mt-4 mb-2">
          {renderInline(line.slice(4), onWikiLink, slugTitleMap)}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={key++} className="text-lg font-bold text-teal-300 mt-5 mb-2">
          {renderInline(line.slice(3), onWikiLink, slugTitleMap)}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={key++} className="text-xl font-bold text-white mt-2 mb-3 pb-2 border-b border-slate-700">
          {renderInline(line.slice(2), onWikiLink, slugTitleMap)}
        </h1>,
      );
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={key++} className="border-l-4 border-teal-500/50 pl-4 my-3 text-slate-400 text-sm italic">
          {renderInline(line.slice(2), onWikiLink, slugTitleMap)}
        </blockquote>,
      );
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-slate-300 text-sm">
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, onWikiLink, slugTitleMap)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      nodes.push(
        <ol key={key++} className="list-decimal list-inside space-y-1 my-2 text-slate-300 text-sm">
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, onWikiLink, slugTitleMap)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const boldParts = line.split(/(\*\*[^*]+\*\*)/g).map((chunk, ci) => {
      if (chunk.startsWith('**') && chunk.endsWith('**')) {
        return <strong key={ci} className="text-slate-100">{chunk.slice(2, -2)}</strong>;
      }
      return <span key={ci}>{renderInline(chunk, onWikiLink, slugTitleMap)}</span>;
    });

    nodes.push(
      <p key={key++} className="text-slate-300 text-sm leading-relaxed my-2">
        {boldParts}
      </p>,
    );
    i++;
  }

  return <article className="wiki-article">{nodes}</article>;
}

export function WikiRelatedLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 mt-4"
    >
      → {label} 바로가기
    </Link>
  );
}
