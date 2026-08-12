"use client";
import React, { useState } from "react";
import MonacoEditor from "../components/editor/MonacoEditor";
import ResultPanel from "../components/simulator/ResultPanel";
import type { SimulationResult } from "../lib/evaluator/engine";
import { Bot, Play, Wand2 } from "lucide-react";
import Link from "next/link";
import { formatCode } from "../lib/utils/formatter";

const DEFAULT_LOG = JSON.stringify(
  {
    _source: {
      model: "Scanned Malware Detection",
      indicators: {
        value: "PAK_Generic.001",
      },
    },
  },
  null,
  2,
);

const DEFAULT_CONFIG = `filter {
  if [indicators][value] =~ /\\/opt\\/metasploit-framework\\/data\\// {
    mutate { add_field => { "whitelisted" => "true", "whitelistId" => "1" } }
  } else if [model] == "Network Sniffing" {
    mutate { add_field => { "whitelisted" => "true", "whitelistId" => "3" } }
  } else if [model] == "Scanned Malware Detection" and [indicators][value] =~ /(?i)^C:\\\\Program Files \\(x86\\)\\\\nxlog\\\\/ {
    mutate { add_field => { "whitelisted" => "true", "whitelistId" => "6" } }
  }
}`;

const DEFAULT_VECTOR_LOG = JSON.stringify(
  {
    last_action: "SOMETHING_ELSE",
    description: "Script contains suspicious features.",
    path: "C:\\\\Scripts\\\\CL_Utility.ps1",
    process_chain: [
      {
        command:
          "powershell.exe -Command ... HKLM:\\\\SOFTWARE\\\\Microsoft\\\\CTF\\\\TIP ...",
      },
      { command: "CompatTelRunner.exe -m:appraiser.dll" },
    ],
  },
  null,
  2,
);

const DEFAULT_VECTOR_CONFIG = `# Whitelist 1
if !exists(.whitelisted) && (.last_action == "DELETE_SUCCESS" || .last_action == "QUARANTINE_SUCCESS") {
    .whitelisted = "true"
    .whitelistID = "1"
}

# Whitelist 2
# if !exists(.whitelisted) && (.description == "Script contains suspicious features.") {
#     .whitelisted = "true"
#     .whitelistID = "disabled"
# }

# Whitelist 3
if !exists(.whitelisted) && (.description == "Script contains suspicious features.") && contains(to_string!(.path), "CL_Utility.ps1") {
    .whitelisted = "true"
    .whitelistID = "2"
}

# Whitelist 4
if !exists(.whitelisted) && match(to_string!(.process_chain[1].command), r'(?i)CompatTelRunner\\.exe...') {
    .whitelisted = "true"
    .whitelistID = "3"
}`;

export default function Home() {
  const [engine, setEngine] = useState<"logstash" | "vector">("logstash");
  const [rawlog, setRawlog] = useState<string>(DEFAULT_LOG);
  const [config, setConfig] = useState<string>(DEFAULT_CONFIG);

  const [vectorRawlog, setVectorRawlog] = useState<string>(DEFAULT_VECTOR_LOG);
  const [vectorConfig, setVectorConfig] = useState<string>(
    DEFAULT_VECTOR_CONFIG,
  );

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeRawLog = engine === "logstash" ? rawlog : vectorRawlog;
  const setActiveRawLog = engine === "logstash" ? setRawlog : setVectorRawlog;
  const activeConfig = engine === "logstash" ? config : vectorConfig;
  const setActiveConfig = engine === "logstash" ? setConfig : setVectorConfig;

  const runSimulation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine,
          rawlog: activeRawLog,
          pipelineConfig: activeConfig,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        let errMsg = data.error || "Simulation failed";
        if (data.message) errMsg += ":\n" + data.message;
        throw new Error(errMsg);
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      {/* Top Navbar */}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4">
        <div className="flex items-center space-x-4">
          <h1 className="font-bold text-white tracking-wide">
            Exclude Simulator
          </h1>
          <div className="flex space-x-1 bg-gray-800 p-1 rounded-md">
            <button
              onClick={() => {
                setEngine("logstash");
                setResult(null);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded ${engine === "logstash" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Logstash
            </button>
            <button
              onClick={() => {
                setEngine("vector");
                setResult(null);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded ${engine === "vector" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Vector (VRL)
            </button>
          </div>
          <div className="h-4 w-px bg-gray-700"></div>
          <a
            href="/filter"
            className="flex items-center text-blue-400 hover:text-white transition-colors text-sm"
          >
            Parser Simulator &rarr;
          </a>
        </div>
        <Link
          href="/auto-whitelist"
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Bot className="h-4 w-4" />
          <span>Auto Whitelist Creator</span>
        </Link>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold flex justify-between items-center text-gray-400">
            <span>Raw Log (JSON)</span>
            <button
              onClick={() => setActiveRawLog(formatCode(activeRawLog, "json"))}
              className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 flex items-center"
            >
              <Wand2 className="h-3 w-3 mr-1" /> Format
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <MonacoEditor
              value={activeRawLog}
              onChange={(v) => setActiveRawLog(v || "")}
              language="json"
            />
          </div>
        </div>

        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold flex justify-between items-center text-gray-400">
            <span>Pipeline Config ({engine === "logstash" ? "Logstash" : "VRL"})</span>
            <button
              onClick={() => setActiveConfig(formatCode(activeConfig, engine))}
              className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 flex items-center"
            >
              <Wand2 className="h-3 w-3 mr-1" /> Format
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <MonacoEditor
              value={activeConfig}
              onChange={(v) => setActiveConfig(v || "")}
              language={engine === "logstash" ? "ruby" : "rust"}
            />
          </div>
        </div>

        <div className="w-1/3 flex flex-col">
          <div className="p-3 bg-gray-950 border-b border-gray-800 font-semibold flex justify-between items-center text-gray-300">
            Simulation Result
            <button
              onClick={runSimulation}
              disabled={isLoading}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-4 w-4" />
              <span>Simulate</span>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ResultPanel result={result} error={error} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
