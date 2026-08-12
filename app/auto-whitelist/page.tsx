"use client";
import React, { useState, useMemo } from "react";
import MonacoEditor from "../../components/editor/MonacoEditor";
import { flattenForPrompt } from "../../lib/evaluator/auto-whitelist-utils";
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Wand2,
} from "lucide-react";
import { formatCode } from "../../lib/utils/formatter";

const DEFAULT_LOG = JSON.stringify(
  {
    hostname: "REDACTED.co.id",
    model: "Scanned Malware Detection",
    indicators: {
      value: "PAK_Generic.001",
      field: "malName",
    },
    impactScope: {
      entities: {
        entityValue: {
          name: "REDACTED.co.id",
          ips: ["10.0.0.11"],
        },
      },
    },
  },
  null,
  2,
);

export default function AutoWhitelist() {
  const [engine, setEngine] = useState<"logstash" | "vector">("logstash");
  const [rawlog, setRawlog] = useState<string>(DEFAULT_LOG);
  const [exampleWhitelist, setExampleWhitelist] = useState<string>("");
  const [description, setDescription] = useState<string>(
    "whitelist event dengan hostname REDACTED.co.id && indicator.value == PAK_Generic.001",
  );
  const [maxRetries, setMaxRetries] = useState<number>(3);

  const [showPaths, setShowPaths] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Attempt History toggle
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

  const availablePaths = useMemo(() => {
    try {
      const parsed = JSON.parse(rawlog);
      let root = parsed;
      if (parsed && typeof parsed === "object" && parsed._source) {
        root = parsed._source;
      }
      return flattenForPrompt(root, engine);
    } catch {
      return ["(Invalid JSON)"];
    }
  }, [rawlog, engine]);

  const runGeneration = async () => {
    if (!description.trim()) {
      setError("Penjelasan whitelist wajib diisi!");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setExpandedAttempt(null);

    try {
      const res = await fetch("/api/auto-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine,
          rawlog,
          exampleWhitelist,
          description,
          maxRetries,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to generate");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      {/* Top Navbar */}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4">
        <div className="flex items-center space-x-4">
          <h1 className="font-bold text-white tracking-wide">
            Auto Whitelist Creator (AI)
          </h1>

          <div className="h-4 w-px bg-gray-700"></div>
          <a
            href="/"
            className="flex items-center text-gray-400 hover:text-white transition-colors text-sm"
          >
            &larr; Exclude Simulator
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Raw Log */}
        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-3 bg-gray-950 border-b border-gray-800 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-400">
              Raw Input (JSON)
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => setRawlog(formatCode(rawlog, "json"))}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 flex items-center"
              >
                <Wand2 className="h-3 w-3 mr-1" /> Format
              </button>
              <button
                onClick={() => setShowPaths(!showPaths)}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              >
                {showPaths ? "Tutup Field Paths" : "Lihat Field Paths"}
              </button>
            </div>
          </div>

          {showPaths && (
            <div className="h-1/3 border-b border-gray-800 bg-gray-900 p-2 overflow-y-auto">
              <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase">
                Available Field Paths
              </h3>
              <div className="font-mono text-[10px] text-green-400 whitespace-pre">
                {availablePaths.map((p: string, i: number) => (
                  <div key={i}>{p}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden p-2">
            <MonacoEditor
              value={rawlog}
              onChange={(v: string | undefined) => setRawlog(v || "")}
              language="json"
              path="auto_whitelist_rawlog.json"
            />
          </div>
        </div>

        {/* Middle Column: Configuration */}
        <div className="w-1/3 flex flex-col border-r border-gray-800 bg-gray-900">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold text-gray-400">
            Prompt Configuration
          </div>
          <div className="p-4 flex flex-col h-full overflow-y-auto space-y-4">
            <div className="flex flex-col space-y-1">
              <label className="text-xs font-semibold text-gray-400">
                Penjelasan Whitelist <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-200 font-sans focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Contoh: whitelist event dengan hostname REDACTED.intra.com.co.id && indicator.value == PAK_Generic.001"
              />
              <p className="text-[10px] text-gray-500">
                Jelaskan kondisi secara detail menggunakan nama field yang ada
                di rawlog.
              </p>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-xs font-semibold text-gray-400">
                Contoh Whitelist (Opsional)
              </label>
              <textarea
                value={exampleWhitelist}
                onChange={(e) => setExampleWhitelist(e.target.value)}
                className="w-full h-24 bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Paste contoh if block..."
              />
              <p className="text-[10px] text-gray-500">
                Untuk membimbing LLM mengikuti gaya penulisan rule Anda.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400">
                Output Type <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-1 bg-gray-800 p-1 rounded-md w-fit">
                <button
                  onClick={() => setEngine("logstash")}
                  className={`px-3 py-1 text-xs font-semibold rounded ${engine === "logstash" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  Logstash
                </button>
                <button
                  onClick={() => setEngine("vector")}
                  className={`px-3 py-1 text-xs font-semibold rounded ${engine === "vector" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  Vector (VRL)
                </button>
              </div>
              <p className="text-[10px] text-gray-500">
                Untuk menentukan output sebagai logstash atau vector.
              </p>
            </div>

            <div className="flex flex-col space-y-1 mt-auto pt-4 border-t border-gray-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-500">
                  Advanced
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-500">Max Retries</span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs w-16 text-center"
                  />
                </div>
              </div>
              <button
                onClick={runGeneration}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <span className="animate-pulse">
                    Generating & Validating...
                  </span>
                ) : (
                  <>
                    <Play size={16} className="mr-2" fill="currentColor" />
                    Generate Whitelist
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded p-3 mt-4 flex items-start">
                <XCircle size={16} className="mr-2 mt-0.5 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="w-1/3 flex flex-col bg-gray-950">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold text-gray-400">
            Output
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!result && !isLoading && !error && (
              <div className="h-full flex flex-col items-center justify-center text-gray-600">
                <p className="text-sm">
                  Silakan isi konfigurasi dan klik Generate.
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Status</h2>
                  {result.verified ? (
                    <span className="flex items-center text-green-400 bg-green-400/10 px-3 py-1 rounded-full text-sm font-bold border border-green-400/20">
                      <CheckCircle size={16} className="mr-1.5" /> ✅ Verified
                    </span>
                  ) : (
                    <span className="flex items-center text-red-400 bg-red-400/10 px-3 py-1 rounded-full text-sm font-bold border border-red-400/20">
                      <XCircle size={16} className="mr-1.5" /> Gagal Match
                    </span>
                  )}
                </div>

                {result.warnings?.length > 0 && (
                  <div className="space-y-2">
                    {result.warnings.map((w: string, i: number) => (
                      <div
                        key={i}
                        className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-sm rounded p-3 flex items-start"
                      >
                        <AlertTriangle
                          size={16}
                          className="mr-2 mt-0.5 shrink-0"
                        />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(result.finalSnippet || result.lastSnippet) && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <h3 className="text-sm font-semibold text-gray-400">
                        Snippet
                      </h3>
                      <button
                        onClick={() =>
                          handleCopy(result.finalSnippet || result.lastSnippet)
                        }
                        className="text-xs flex items-center text-gray-400 hover:text-white transition-colors"
                      >
                        <Copy size={12} className="mr-1" /> Copy
                      </button>
                    </div>
                    <div className="bg-[#1e1e1e] border border-gray-800 rounded p-3 font-mono text-sm overflow-x-auto text-blue-300">
                      <pre className="whitespace-pre-wrap">
                        {result.finalSnippet || result.lastSnippet}
                      </pre>
                    </div>
                  </div>
                )}

                {result.explanation && (
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-400">
                      Penjelasan LLM
                    </h3>
                    <div className="bg-gray-900 border border-gray-800 p-3 rounded text-sm text-gray-300">
                      {result.explanation}
                    </div>
                  </div>
                )}

                {result.lastError && !result.verified && (
                  <div className="bg-red-900/30 border border-red-800 p-3 rounded text-sm text-red-300">
                    <strong>Error Terakhir:</strong> {result.lastError}
                  </div>
                )}

                {/* Attempt History */}
                {result.attempts && result.attempts.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-500 mb-3">
                      Attempt History
                    </h3>
                    <div className="space-y-2">
                      {result.attempts.map((attempt: any, i: number) => (
                        <div
                          key={i}
                          className="border border-gray-800 rounded overflow-hidden"
                        >
                          <button
                            onClick={() =>
                              setExpandedAttempt(
                                expandedAttempt === i ? null : i,
                              )
                            }
                            className="w-full bg-gray-900 p-2 flex items-center justify-between text-xs hover:bg-gray-800 transition-colors"
                          >
                            <span className="flex items-center font-mono">
                              <span
                                className={`w-2 h-2 rounded-full mr-2 ${attempt.matched ? "bg-green-500" : "bg-red-500"}`}
                              ></span>
                              Attempt #{attempt.attemptNumber}
                            </span>
                            {expandedAttempt === i ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                          {expandedAttempt === i && (
                            <div className="p-3 bg-gray-950 text-xs border-t border-gray-800 space-y-2">
                              {attempt.snippet && (
                                <div>
                                  <span className="text-gray-500 font-semibold mb-1 block">
                                    Snippet:
                                  </span>
                                  <pre className="bg-[#1e1e1e] p-2 rounded text-blue-300 overflow-x-auto font-mono whitespace-pre-wrap">
                                    {attempt.snippet}
                                  </pre>
                                </div>
                              )}
                              {attempt.error && (
                                <div className="text-red-400 bg-red-900/20 p-2 rounded">
                                  Error: {attempt.error}
                                </div>
                              )}
                              {attempt.trace && (
                                <div>
                                  <span className="text-gray-500 font-semibold mb-1 block">
                                    Trace:
                                  </span>
                                  <pre className="bg-gray-900 p-2 rounded text-gray-400 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(attempt.trace, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
