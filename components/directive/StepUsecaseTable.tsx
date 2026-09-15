"use client";
import React from "react";
import { UsecaseTable } from "./UsecaseTable";
import type { PluginSidEntry } from "../../lib/directive/types";

export function StepUsecaseTable({
  entries, group, pluginId, hasCustomUsecase, setEntries,
}: {
  entries: PluginSidEntry[]; group: string; pluginId: number;
  hasCustomUsecase: boolean; setEntries: (e: PluginSidEntry[]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Usecase Table</h2>
        <p className="text-sm text-gray-400">
          Define each usecase. The <span className="text-yellow-300 font-mono">Title</span> must exactly match the field value looked up in the enrichment table.
          {hasCustomUsecase && <span className="text-blue-300"> For custom VRL usecases, title must match <code className="bg-gray-800 px-1 rounded">.usecase.title_name</code>.</span>}
        </p>
      </div>
      <UsecaseTable entries={entries} group={group} pluginId={pluginId} onChange={setEntries} />
      <div className="text-xs text-gray-500">
        Plugin ID: <span className="text-gray-300 font-mono">{pluginId}</span> · Group: <span className="text-gray-300 font-mono">{group}</span> ·
        Directive ID formula: <span className="text-gray-300 font-mono">{pluginId}000{"{sid}"}</span>
      </div>
    </div>
  );
}
