"use client";
import React, { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { PluginSidEntry } from "../../lib/directive/types";
import { DirectiveEditModal } from "./DirectiveEditModal";

export const MITRE_TACTICS = [
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
  "Reconnaissance", "Resource Development", "Exploit Public-Facing Application",
];

export const MITRE_KINGDOMS = [
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

export function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function UsecaseTable({
  entries,
  group,
  pluginId,
  onChange,
}: {
  entries: PluginSidEntry[];
  group: string;
  pluginId: number;
  onChange: (entries: PluginSidEntry[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addRow = () => {
    const nextSid = entries.length > 0 ? Math.max(...entries.map((e) => e.sid)) + 1 : 1;
    onChange([
      ...entries,
      { id: genId(), plugin: group, pluginId, sid: nextSid, title: "", category: MITRE_TACTICS[0], kingdom: MITRE_KINGDOMS[0] },
    ]);
  };

  const updateRow = (id: string, field: keyof PluginSidEntry, value: any) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeRow = (id: string) => {
    const filtered = entries.filter((e) => e.id !== id);
    onChange(filtered.map((e, i) => ({ ...e, sid: i + 1 })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800">
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-10">SID</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium">Title (exact match key)</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-48">Category (MITRE Tactic)</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-48">Kingdom (MITRE Phase)</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={entry.id} className={`border-t border-gray-700 ${idx % 2 === 0 ? "bg-gray-900" : "bg-gray-950"}`}>
                <td className="px-3 py-1.5 text-gray-400 font-mono text-center">
                  {entry.sid}
                  {entry.rulesOverride && (
                    <span className="ml-1 text-blue-400 text-xs" title="Custom rules applied">●</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={entry.title}
                    onChange={(e) => updateRow(entry.id, "title", e.target.value)}
                    placeholder="Exact usecase title..."
                    className="w-full bg-transparent text-gray-200 outline-none border-b border-transparent focus:border-blue-500 placeholder-gray-600 py-0.5 transition-colors"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={entry.category}
                    onChange={(e) => updateRow(entry.id, "category", e.target.value)}
                    className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
                  >
                    {MITRE_TACTICS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={entry.kingdom}
                    onChange={(e) => updateRow(entry.id, "kingdom", e.target.value)}
                    className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
                  >
                    {MITRE_KINGDOMS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5 flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(entry.id)}
                    className="text-gray-400 hover:text-blue-400 transition-colors"
                    title="Edit directive rules"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeRow(entry.id)} className="text-red-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-600">No usecases yet. Click "Add Row" to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-600 rounded-md transition-colors">
          <Plus className="h-4 w-4" /> Add Row
        </button>
      </div>

      {editingId && (() => {
        const entry = entries.find((e) => e.id === editingId);
        if (!entry) return null;
        return (
          <DirectiveEditModal
            entry={entry}
            onSave={(updated) => {
              onChange(entries.map((e) => (e.id === updated.id ? updated : e)));
              setEditingId(null);
            }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}
    </div>
  );
}
