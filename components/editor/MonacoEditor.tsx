"use client";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type MonacoEditorProps = {
  value: string;
  onChange: (value: string | undefined) => void;
  language: string;
  path?: string;
};

import { useRef } from "react";

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  wordWrap: "on" as const,
  scrollBeyondLastLine: false,
};

export default function MonacoEditor({
  value,
  onChange,
  language,
  path,
}: MonacoEditorProps) {
  const editorRef = useRef<any>(null);

  return (
    <div 
      className="h-full w-full rounded-md overflow-hidden border border-gray-700 bg-[#1e1e1e]"
      onMouseDown={() => {
        // Force focus in Chrome to fix the flexbox focus-stealing bug
        editorRef.current?.focus();
      }}
    >
      <Editor
        height="100%"
        language={language}
        path={path}
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={EDITOR_OPTIONS}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
      />
    </div>
  );
}
