"use client";
import React from "react";
import MonacoEditor from "../editor/MonacoEditor";
import { CopyButton } from "./CopyButton";
import { ArrowLeft, Info } from "lucide-react";

export function FileViewer({ name, content, language, onClose }: {
  name: string; content: string; language: string; onClose: () => void;
}) {
  const getHelp = () => {
    if (name.endsWith(".tsv")) return { purpose: "Enrichment table mapping title → plugin_id + plugin_sid", destination: "Vector pod: /etc/dsiem-plugin-tsv/" };
    if (name.endsWith(".json")) return { purpose: "Directive rules consumed by DSIEM backend", destination: "dsiem-frontend pod: dsiem/configs/" };
    if (name.endsWith(".yaml")) return { purpose: "Vector transform that normalizes events and looks up plugin_sid", destination: "Vector parser: /root/data/mgmt/kubeappl/vector-parser/configs/{device}/" };
    if (name.endsWith(".vrl")) return { purpose: "Custom usecase tagging (optional)", destination: "Vector parser: /root/data/mgmt/kubeappl/vector-parser/configs/{device}/" };
    return null;
  };
  const help = getHelp();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 bg-gray-950 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-mono text-gray-300">{name}</span>
        </div>
        <CopyButton text={content} />
      </div>
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
        {help && (
          <div className="bg-blue-950/30 border border-blue-900 rounded-md p-3 flex gap-3 text-sm text-blue-200 flex-shrink-0">
            <Info className="h-5 w-5 flex-shrink-0 text-blue-400" />
            <div className="flex flex-col gap-1">
              <div><span className="font-semibold text-blue-300">Purpose:</span> {help.purpose}</div>
              <div><span className="font-semibold text-blue-300">Destination:</span> <code className="bg-blue-900/50 px-1.5 py-0.5 rounded text-xs font-mono">{help.destination}</code></div>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <MonacoEditor value={content} onChange={() => {}} language={language} path={name} />
        </div>
      </div>
    </div>
  );
}
