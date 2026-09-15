"use client";
import React from "react";
import MonacoEditor from "../editor/MonacoEditor";
import { CopyButton } from "./CopyButton";
import { ArrowLeft } from "lucide-react";

export function FileViewer({ name, content, language, onClose }: {
  name: string; content: string; language: string; onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 bg-gray-950 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-mono text-gray-300">{name}</span>
        </div>
        <CopyButton text={content} />
      </div>
      <div className="flex-1 p-3">
        <MonacoEditor value={content} onChange={() => {}} language={language} path={name} />
      </div>
    </div>
  );
}
