"use client";
import React from "react";
import MonacoEditor from "../editor/MonacoEditor";
import { CopyButton } from "./CopyButton";
import { Wand2, Play, X } from "lucide-react";

export function StepVrlFilter({
  group,
  vrlContent,
  setVrlContent,
  vrlRawlog,
  setVrlRawlog,
  vrlDesc,
  setVrlDesc,
  vrlLoading,
  vrlTestResult,
  vrlGenResult,
  onTestVrl,
  onGenerateVrl,
}: {
  group: string;
  vrlContent: string;
  setVrlContent: (v: string) => void;
  vrlRawlog: string;
  setVrlRawlog: (v: string) => void;
  vrlDesc: string;
  setVrlDesc: (v: string) => void;
  vrlLoading: boolean;
  vrlTestResult: any;
  vrlGenResult: { attempts: any[]; error?: string } | null;
  onTestVrl: () => void;
  onGenerateVrl: () => void;
}) {
  const [showTestModal, setShowTestModal] = React.useState(false);

  React.useEffect(() => {
    if (vrlTestResult) {
      setShowTestModal(true);
    }
  }, [vrlTestResult]);

  const template = `# Template — add your usecase blocks below\n# Pattern:\n# if !exists(.usecase.id) && (<condition>) {\n#   .usecase.author     = "analyst"\n#   .usecase.id         = "1"\n#   .usecase.title_name = "Exact title matching TSV"\n#   .usecase.type       = "Custom"\n#   .usecase.description = "What this detects."\n# }\n`;
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-white">
            60_custom-filter_{group}.vrl
          </span>
          <CopyButton text={vrlContent} />
        </div>
        <div className="flex-1 min-h-0">
          <MonacoEditor
            value={vrlContent}
            onChange={(v) => setVrlContent(v || "")}
            language="plaintext"
            path="60-filter.vrl"
          />
        </div>
        {!vrlContent && (
          <button
            onClick={() => setVrlContent(template)}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            → Insert template
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-gray-700 p-3 bg-gray-900 flex flex-col gap-3">
          <span className="text-xs font-semibold text-gray-300">
            🤖 Auto-Generate Usecase with AI
          </span>
          <textarea
            value={vrlDesc}
            onChange={(e) => setVrlDesc(e.target.value)}
            rows={2}
            placeholder="Describe what this usecase should detect..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
          />
          <button
            onClick={onGenerateVrl}
            disabled={vrlLoading || !vrlDesc.trim()}
            className="flex items-center gap-2 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors self-start"
          >
            <Wand2 className="h-3 w-3" />
            {vrlLoading ? "Generating..." : "Generate & Append"}
          </button>
          {vrlGenResult && (
            <div
              className={`text-xs p-2 rounded ${vrlGenResult.error ? "bg-red-950 text-red-300 border border-red-800" : "bg-green-950 text-green-300 border border-green-800"}`}
            >
              {vrlGenResult.error
                ? `Error: ${vrlGenResult.error}`
                : `✓ Generated! ${(vrlGenResult as any).explanation || ""}`}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-700 p-3 bg-gray-900 flex flex-col gap-2 flex-1">
          <span className="text-xs font-semibold text-gray-300">
            🧪 Test VRL Against Raw Log
          </span>
          <div className="flex-1 min-h-0 h-40">
            <MonacoEditor
              value={vrlRawlog}
              onChange={(v) => setVrlRawlog(v || "")}
              language="json"
              path="vrl-test-rawlog.json"
            />
          </div>
          <button
            onClick={onTestVrl}
            className="flex items-center gap-2 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md transition-colors self-start"
          >
            <Play className="h-3 w-3" /> Test VRL
          </button>
          {vrlTestResult && (
            <button
              onClick={() => setShowTestModal(true)}
              className="text-xs text-blue-400 hover:text-blue-300 self-start text-left"
            >
              → View Last Test Results
            </button>
          )}

          {/* Result Modal */}
          {showTestModal && vrlTestResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl flex flex-col h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-bold text-white">
                      VRL Test Results
                    </h3>
                    {!vrlTestResult.error && (
                      <div className={`px-2 py-1 rounded text-xs font-semibold ${JSON.stringify(vrlTestResult).includes('"usecase"') ? "bg-green-900 text-green-300 border border-green-700" : "bg-yellow-900 text-yellow-300 border border-yellow-700"}`}>
                        {JSON.stringify(vrlTestResult).includes('"usecase"') ? "✓ Rule Match" : "⚠ No Rule Match"}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowTestModal(false)}
                    className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 p-4">
                  {vrlTestResult.error ? (
                    <div className="p-4 bg-red-950/50 border border-red-800 rounded-md text-red-300 font-mono text-sm overflow-auto h-full">
                      {vrlTestResult.error}
                    </div>
                  ) : (
                    <MonacoEditor
                      value={JSON.stringify(vrlTestResult, null, 2)}
                      onChange={() => {}}
                      language="json"
                      path="test-result.json"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
