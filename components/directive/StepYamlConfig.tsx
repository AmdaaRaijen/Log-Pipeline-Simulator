"use client";
import React from "react";
import MonacoEditor from "../editor/MonacoEditor";
import { CopyButton } from "./CopyButton";
import { Plus, Trash2 } from "lucide-react";
import { generate70Yaml } from "../../lib/directive/generator";
import type { YamlConfig } from "../../lib/directive/types";

export function StepYamlConfig({
  group, yamlConfig, setYamlConfig,
}: {
  group: string; yamlConfig: YamlConfig; setYamlConfig: React.Dispatch<React.SetStateAction<YamlConfig>>;
}) {
  const previewYaml = generate70Yaml(group, yamlConfig);
  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <div className="space-y-4 overflow-y-auto pr-2">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">YAML Configuration</h2>
          <p className="text-sm text-gray-400">Fill in the placeholders for <code className="bg-gray-800 px-1 rounded text-xs">70_dsiem-plugin_{group}.yaml</code>.</p>
        </div>

        {([
          { label: "TSV File Name", key: "tsvFileName" as keyof YamlConfig, placeholder: "secdev_plugin-sids" },
          { label: "Index Name", key: "indexName" as keyof YamlConfig, placeholder: "wazuh" },
          { label: "Filter Field (must exist)", key: "filterFieldName" as keyof YamlConfig, placeholder: ".rule.name or .usecase.id" },
          { label: "Referer Field (lookup key)", key: "refererField" as keyof YamlConfig, placeholder: ".rule.name or .usecase.title_name" },
        ] as const).map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
              value={yamlConfig[key] as string}
              onChange={(e) => setYamlConfig((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono text-gray-300 focus:border-blue-500 focus:outline-none"
              placeholder={placeholder}
            />
          </div>
        ))}

        <div>
          <label className="block text-xs text-gray-400 mb-2">Custom Data Fields (max 3)</label>
          {yamlConfig.customData.map((cd, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={cd.label}
                onChange={(e) => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.map((d, j) => j === i ? { ...d, label: e.target.value } : d) }))}
                placeholder="Label (e.g. Action)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-300 focus:border-blue-500 focus:outline-none" />
              <input value={cd.field}
                onChange={(e) => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.map((d, j) => j === i ? { ...d, field: e.target.value } : d) }))}
                placeholder="Field (e.g. .action)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none" />
              <button onClick={() => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.filter((_, j) => j !== i) }))}
                className="text-red-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {yamlConfig.customData.length < 3 && (
            <button onClick={() => setYamlConfig((prev) => ({ ...prev, customData: [...prev.customData, { label: "", field: "" }] }))}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add Field
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-semibold">Live Preview — 70_dsiem-plugin_{group}.yaml</span>
          <CopyButton text={previewYaml} />
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor value={previewYaml} onChange={() => {}} language="yaml" path="preview-70.yaml" />
        </div>
      </div>
    </div>
  );
}
