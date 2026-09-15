"use client";
import React, { useState } from "react";
import { ChevronRight, ChevronDown, FolderOpen, FileText, Plus, X } from "lucide-react";
import type { DirectiveProject } from "../../lib/directive/types";

export function FileSidebar({
  projects,
  activeProjectId,
  onSelect,
  onDelete,
  onNew,
  viewFile,
}: {
  projects: DirectiveProject[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  viewFile: (projectId: string, fileKey: keyof DirectiveProject["generatedFiles"]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fileEntries: { key: keyof DirectiveProject["generatedFiles"]; label: string }[] = [
    { key: "pluginSidsTsv", label: "_plugin-sids.tsv" },
    { key: "directiveJson", label: "directives_dsiem-backend-0_.json" },
    { key: "yaml70", label: "70_dsiem-plugin_.yaml" },
    { key: "customVrl60", label: "60_custom-filter_.vrl" },
  ];

  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col text-sm flex-shrink-0">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <span className="font-semibold text-gray-300 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-blue-400" /> Projects
        </span>
        <button
          onClick={onNew}
          className="text-xs text-blue-400 hover:text-white flex items-center gap-1 hover:bg-gray-800 px-2 py-1 rounded transition-colors"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 && (
          <div className="p-4 text-gray-500 text-xs text-center">
            No projects yet.<br />Click "New" to create one.
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id}>
            <div
              className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer group hover:bg-gray-800 ${activeProjectId === p.id ? "bg-gray-800" : ""}`}
              onClick={() => { toggle(p.id); onSelect(p.id); }}
            >
              {expanded.has(p.id)
                ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
              <span className="text-yellow-400 text-xs">📁</span>
              <span className="text-gray-300 truncate flex-1 text-xs font-medium">{p.name}</span>
              <span className="text-gray-600 text-xs flex-shrink-0">({p.indexName})</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 ml-1 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {expanded.has(p.id) && (
              <div className="ml-6">
                {fileEntries.map(({ key, label }) => {
                  const content = p.generatedFiles[key];
                  if (!content) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                      onClick={() => viewFile(p.id, key)}
                    >
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate text-xs">{`${p.name}${label}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
