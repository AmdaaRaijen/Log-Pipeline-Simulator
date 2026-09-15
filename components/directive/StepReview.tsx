"use client";
import React from "react";
import MonacoEditor from "../editor/MonacoEditor";
import { CopyButton } from "./CopyButton";
import { Save } from "lucide-react";
import type { DirectiveProject } from "../../lib/directive/types";

export function StepReview({
  group, indexName, files, activeTab, setActiveTab, onSave,
}: {
  group: string; indexName: string;
  files: DirectiveProject["generatedFiles"];
  activeTab: number; setActiveTab: (i: number) => void;
  onSave: () => void;
}) {
  const fileList = [
    { label: `${group}_plugin-sids.tsv`, content: files.pluginSidsTsv, lang: "plaintext" },
    { label: `directives_dsiem-backend-0_${group}.json`, content: files.directiveJson, lang: "json" },
    { label: `70_dsiem-plugin_${group}.yaml`, content: files.yaml70, lang: "yaml" },
    ...(files.customVrl60 ? [{ label: `60_custom-filter_${group}.vrl`, content: files.customVrl60, lang: "plaintext" }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Review & Export</h2>
          <p className="text-sm text-gray-400">All files generated. Copy or save the project.</p>
        </div>
        <button onClick={onSave}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
          <Save className="h-4 w-4" /> Save Project
        </button>
      </div>

      <div className="flex gap-1">
        {fileList.map((f, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${activeTab === i ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex justify-end">
          <CopyButton text={fileList[activeTab]?.content || ""} />
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor
            value={fileList[activeTab]?.content || ""}
            onChange={() => {}}
            language={fileList[activeTab]?.lang || "plaintext"}
            path={fileList[activeTab]?.label}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-xs text-gray-400 space-y-1">
        <div className="text-gray-300 font-semibold mb-2">📋 Deployment Checklist</div>
        <div>1. Copy <span className="text-yellow-300 font-mono">{group}_plugin-sids.tsv</span> → <span className="font-mono">/root/data/nfs/pvc-&#123;uuid&#125;/dsiem-plugin-tsv/</span></div>
        <div>2. Deploy <span className="text-yellow-300 font-mono">directives_dsiem-backend-0_{group}.json</span> → dsiem-frontend pod: <span className="font-mono">dsiem/configs/</span></div>
        <div>3. Deploy <span className="text-yellow-300 font-mono">70_dsiem-plugin_{group}.yaml</span> → <span className="font-mono">/root/data/mgmt/kubeappl/vector-parser/configs/{indexName}/</span></div>
        {files.customVrl60 && <div>4. Deploy <span className="text-yellow-300 font-mono">60_custom-filter_{group}.vrl</span> → same vector-parser configs folder</div>}
        <div className="pt-1">5. Restart: <span className="font-mono">kubectl delete pod vector-parser{"<Tab>"}; kubectl delete pod -l app=dsiem-backend</span></div>
      </div>
    </div>
  );
}
