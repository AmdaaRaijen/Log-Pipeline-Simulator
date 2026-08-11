"use client";
import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type MonacoEditorProps = {
  value: string;
  onChange: (value: string | undefined) => void;
  language: string;
};

export default function MonacoEditor({ value, onChange, language }: MonacoEditorProps) {
  return (
    <div className="h-full w-full rounded-md overflow-hidden border border-gray-700 bg-[#1e1e1e]">
      <Editor
        height="100%"
        defaultLanguage={language}
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}
