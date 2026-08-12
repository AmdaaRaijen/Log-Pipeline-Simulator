"use client";
import React, { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { SimulationResult, TraceEntry } from '../../lib/evaluator/engine';

type ResultPanelProps = {
  result: SimulationResult | null;
  error: string | null;
  isLoading: boolean;
};

export default function ResultPanel({ result, error, isLoading }: ResultPanelProps) {
  const [expandedTrace, setExpandedTrace] = useState<number | null>(null);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-gray-400">Simulating...</div>;
  }

  if (error) {
    return (
      <div className="h-full p-6 text-red-400">
        <h3 className="font-bold text-lg mb-2 flex items-center"><XCircle className="mr-2" /> Error</h3>
        <pre className="whitespace-pre-wrap bg-red-950 p-4 rounded-md border border-red-800 text-sm">
          {error}
        </pre>
      </div>
    );
  }

  if (!result) {
    return <div className="h-full flex items-center justify-center text-gray-500">Run simulation to see results here.</div>;
  }

  const { matched, evaluationTrace, resultEvent, matchedRule, warnings } = result;

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200 p-4 overflow-y-auto">
      <div className={`p-4 rounded-md mb-6 flex items-center border ${matched ? 'bg-green-950 border-green-800 text-green-300' : 'bg-red-950 border-red-800 text-red-300'}`}>
        {matched ? <CheckCircle className="mr-3 h-8 w-8" /> : <XCircle className="mr-3 h-8 w-8" />}
        <div>
          <h2 className="text-xl font-bold">{matched ? 'Whitelisted / Matched' : 'Not Whitelisted'}</h2>
          {matchedRule && (
            <p className="text-sm opacity-80">Matched Rule: Branch {matchedRule.branchIndex} (Line {matchedRule.sourceLine})</p>
          )}
        </div>
      </div>

      {warnings && warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {warnings.map((warn: string, idx: number) => (
            <div key={idx} className="p-3 bg-yellow-950 border border-yellow-800 rounded-md flex items-start text-yellow-300 text-sm">
              <AlertTriangle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 border-b border-gray-700 pb-2">Evaluation Trace</h3>
        <div className="space-y-2">
          {evaluationTrace.map((trace: TraceEntry, idx: number) => (
            <div key={idx} className="border border-gray-700 rounded-md bg-gray-800 overflow-hidden">
              <button 
                onClick={() => setExpandedTrace(expandedTrace === idx ? null : idx)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-700 transition-colors focus:outline-none"
              >
                <div className="flex items-center space-x-3">
                  {trace.matched ? <CheckCircle className="text-green-500 h-5 w-5" /> : <XCircle className="text-red-500 h-5 w-5" />}
                  <span className="font-medium text-sm">Branch {trace.branchIndex}</span>
                </div>
                {expandedTrace === idx ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
              </button>
              {expandedTrace === idx && (
                <div className="p-3 bg-gray-950 border-t border-gray-700 text-sm font-mono text-gray-400 break-all">
                  {trace.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3 border-b border-gray-700 pb-2">Resulting Event</h3>
        <pre className="bg-[#1e1e1e] p-4 rounded-md border border-gray-700 text-sm overflow-x-auto text-green-300">
          {JSON.stringify(resultEvent, null, 2)}
        </pre>
      </div>
    </div>
  );
}
