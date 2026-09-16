"use client";
import React from "react";
import { UsecaseTable } from "./UsecaseTable";
import type { PluginSidEntry, YamlConfig } from "../../lib/directive/types";

export function StepUsecaseTable({
  entries, group, pluginId, hasCustomUsecase, setEntries,
  yamlConfig, setYamlConfig,
}: {
  entries: PluginSidEntry[]; group: string; pluginId: number;
  hasCustomUsecase: boolean; setEntries: (e: PluginSidEntry[]) => void;
  yamlConfig: YamlConfig; setYamlConfig: React.Dispatch<React.SetStateAction<YamlConfig>>;
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

      <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
        <label className="block text-xs text-gray-400 mb-1">
          Referer Field (lookup key)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          If you are extending existing usecases without custom VRL, you may need to adjust this field. This will automatically populate the YAML step.
        </p>
        <input
          value={yamlConfig.refererField}
          onChange={(e) => setYamlConfig(prev => ({ ...prev, refererField: e.target.value }))}
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono text-gray-300 focus:border-blue-500 focus:outline-none"
          placeholder=".usecase.title_name or .rule.name"
        />
      </div>

      <UsecaseTable entries={entries} group={group} pluginId={pluginId} onChange={setEntries} />
      <div className="text-xs text-gray-500">
        Plugin ID: <span className="text-gray-300 font-mono">{pluginId}</span> · Group: <span className="text-gray-300 font-mono">{group}</span> ·
        Directive ID formula: <span className="text-gray-300 font-mono">{pluginId}000{"{sid}"}</span>
      </div>
    </div>
  );
}
