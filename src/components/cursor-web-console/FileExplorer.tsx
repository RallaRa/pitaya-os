'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import type { FileTreeNode } from './types';

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  expanded,
  toggle,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  toggle: (path: string) => void;
}) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isDir) toggle(node.path);
          else onSelect(node.path);
        }}
        className={`w-full flex items-center gap-1 py-0.5 pr-2 text-left text-[12px] hover:bg-[#2a2d2e] ${
          isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isDir ? (
          isOpen ? <ChevronDown className="w-3 h-3 shrink-0 text-[#858585]" /> : <ChevronRight className="w-3 h-3 shrink-0 text-[#858585]" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          isOpen ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-[#dcb67a]" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-[#dcb67a]" />
        ) : (
          <File className="w-3.5 h-3.5 shrink-0 text-[#858585]" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && isOpen && node.children?.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </>
  );
}

export default function FileExplorer({
  tree,
  loading,
  selectedPath,
  onSelect,
  onRefresh,
}: {
  tree: FileTreeNode[];
  loading: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['src', 'src/app', 'src/components']));

  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#252526] text-[#cccccc]">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#bbbbbb]">
        <span>Explorer</span>
        <button type="button" onClick={onRefresh} className="p-1 hover:bg-[#2a2d2e] rounded" title="새로고침">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="px-2 py-1 text-[11px] text-[#858585] font-semibold">PITAYA-OS</div>
        {loading && tree.length === 0 ? (
          <p className="px-3 text-xs text-[#858585]">로딩 중...</p>
        ) : (
          tree.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expanded={expanded}
              toggle={toggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
