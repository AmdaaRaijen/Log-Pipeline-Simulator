"use client";
import React, { useState } from "react";
import Link from "next/link";
import MonacoEditor from "../../components/editor/MonacoEditor";
import MultiResultPanel from "../../components/simulator/MultiResultPanel";
import type { StageTraceEntry } from "../../lib/evaluator/filter-engine";
import type { LogEvent } from "../../lib/evaluator/helpers";
import { Play, ArrowLeft, Settings } from "lucide-react";

const DEFAULT_LOG = JSON.stringify(
  {
    model: "Scanned Malware Detection",
    impactScope: { entities: [{ name: "e1" }, { name: "e2" }] },
    indicators: [{ value: "PAK_Generic.001" }, { value: "other_indicator" }],
  },
  null,
  2,
);

const DEFAULT_CONFIG = `filter {
  if [impactScope][entities] {
    split { field => "[impactScope][entities]" }
  }
  
  if [indicators] {
    split { field => "[indicators]" }
    mutate {
      add_field => { "indicator_value" => "%{[indicators][value]}" }
    }
  }
  
  mutate {
    remove_field => ["[indicators]"]
  }
}`;

export default function FilterSimulator() {
  const [rawlog, setRawlog] = useState<string>(DEFAULT_LOG);
  const [config, setConfig] = useState<string>(DEFAULT_CONFIG);
  const [result, setResult] = useState<{
    trace: StageTraceEntry[];
    finalEvents: LogEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Settings
  const [practicalMode, setPracticalMode] = useState(true);

  const runSimulation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawlog,
          pipelineConfig: config,
          practicalMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        let errMsg = data.error || "Simulation failed";
        if (data.message) errMsg += ": " + data.message;
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
          <Link
            href="/"
            className="flex items-center text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Exclude Simulator (v1)
          </Link>
          <div className="h-4 w-px bg-gray-700"></div>
          <h1 className="font-bold text-white tracking-wide">
            Filter Simulator (v2)
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={practicalMode}
              onChange={(e) => setPracticalMode(e.target.checked)}
              className="rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-blue-600 focus:ring-offset-gray-900"
            />
            <span>Practical Mode (skip JSON parse on missing source)</span>
          </label>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold flex justify-between items-center text-gray-400">
            Raw Payload (Pre-filter API Event)
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <MonacoEditor
              value={rawlog}
              onChange={(v) => setRawlog(v || "")}
              language="json"
            />
          </div>
        </div>

        <div className="w-1/3 flex flex-col border-r border-gray-800">
          <div className="p-3 bg-gray-950 border-b border-gray-800 text-sm font-semibold flex justify-between items-center text-gray-400">
            50_filter.conf
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <MonacoEditor
              value={config}
              onChange={(v) => setConfig(v || "")}
              language="ruby"
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
            <MultiResultPanel
              result={result}
              error={error}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
