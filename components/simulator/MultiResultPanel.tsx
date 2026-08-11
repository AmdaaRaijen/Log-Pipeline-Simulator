"use client";
import React, { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import type { LogEvent } from '../../lib/evaluator/helpers';
import type { StageTraceEntry } from '../../lib/evaluator/filter-engine';

type MultiResultPanelProps = {
  result: { trace: StageTraceEntry[], finalEvents: LogEvent[] } | null;
  error: string | null;
  isLoading: boolean;
};

export default function MultiResultPanel({ result, error, isLoading }: MultiResultPanelProps) {
  const [expandedTrace, setExpandedTrace] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<number>(0);

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

  const { trace, finalEvents } = result;
  const activeEventIdx = selectedEvent < finalEvents.length ? selectedEvent : 0;
  
  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200 overflow-y-auto">
      {/* Result Summary Bar */}
      <div className="p-4 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
        <div className="flex items-center space-x-3">
           <Info className="h-5 w-5 text-blue-400" />
           <span className="font-medium text-sm">
             1 Input Event &rarr; <strong className="text-white">{finalEvents.length}</strong> Output Events
           </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: Trace */}
        <div className="w-1/2 flex flex-col border-r border-gray-800 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-gray-500">Evaluation Trace (Sequential)</h3>
          <div className="space-y-2">
            {trace.map((t, idx) => (
              <div key={idx} className="border border-gray-700 rounded-md bg-gray-800 overflow-hidden text-sm">
                <button 
                  onClick={() => setExpandedTrace(expandedTrace === idx ? null : idx)}
                  className="w-full flex flex-col p-3 text-left hover:bg-gray-700 transition-colors focus:outline-none"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-2">
                      {t.dropped ? (
                         <XCircle className="h-4 w-4 text-red-500" />
                      ) : t.warnings && t.warnings.length > 0 ? (
                         <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      ) : t.conditionMet ? (
                         <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                         <XCircle className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="font-semibold text-gray-300">Line {t.sourceLine}</span>
                      <span className="bg-gray-700 px-2 rounded-full text-xs text-blue-300">{t.plugin}</span>
                    </div>
                    {expandedTrace === idx ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                {expandedTrace === idx && (
                  <div className="p-3 bg-gray-950 border-t border-gray-700 font-mono text-gray-400 break-all text-xs">
                    <p className="mb-1"><span className="text-gray-500">Event ID:</span> {t.eventRef}</p>
                    <p className="mb-1"><span className="text-gray-500">Condition:</span> {t.reason}</p>
                    {t.dropped && <p className="text-red-400 mt-2 font-semibold">Event Dropped</p>}
                    {t.warnings && t.warnings.length > 0 && (
                      <div className="mt-2 p-2 bg-yellow-950 border border-yellow-800 text-yellow-300 rounded">
                        {t.warnings.map((w, i) => <div key={i}>{w}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {trace.length === 0 && <div className="text-gray-500 text-sm">No rules executed.</div>}
          </div>
        </div>

        {/* Right pane: Output Events */}
        <div className="w-1/2 flex flex-col p-4 overflow-y-auto">
           <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-gray-500 flex justify-between">
             Resulting Events
           </h3>
           {finalEvents.length === 0 ? (
             <div className="text-gray-500 text-sm text-center py-10 bg-gray-950 rounded-md border border-gray-800">
                0 Events (Dropped)
             </div>
           ) : (
             <div className="flex flex-col h-full">
                <div className="flex overflow-x-auto space-x-2 pb-2 mb-2">
                  {finalEvents.map((e, idx) => (
                    <button
                      key={e.__id}
                      onClick={() => setSelectedEvent(idx)}
                      className={`px-3 py-1.5 rounded-md whitespace-nowrap text-xs font-medium transition-colors ${activeEventIdx === idx ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                      Event #{idx + 1}
                    </button>
                  ))}
                </div>
                <div className="flex-1 bg-[#1e1e1e] p-4 rounded-md border border-gray-700 overflow-y-auto text-sm">
                  {finalEvents[activeEventIdx] && (
                     <>
                        <div className="mb-4">
                          <h4 className="text-xs uppercase text-gray-500 font-bold mb-1 border-b border-gray-700 pb-1">Lineage / ID</h4>
                          <div className="text-gray-400 font-mono text-xs">
                             ID: {finalEvents[activeEventIdx].__id}
                             {finalEvents[activeEventIdx].__parentId && <div>Parent: {finalEvents[activeEventIdx].__parentId}</div>}
                          </div>
                        </div>
                        
                        {Object.keys(finalEvents[activeEventIdx].metadata).length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs uppercase text-blue-400 font-bold mb-1 border-b border-gray-700 pb-1">@metadata (Internal Only)</h4>
                            <pre className="text-blue-300 overflow-x-auto text-xs">
                              {JSON.stringify(finalEvents[activeEventIdx].metadata, null, 2)}
                            </pre>
                          </div>
                        )}

                        <div>
                          <h4 className="text-xs uppercase text-green-500 font-bold mb-1 border-b border-gray-700 pb-1">Body (Elasticsearch Document)</h4>
                          <pre className="text-green-300 overflow-x-auto">
                            {JSON.stringify(finalEvents[activeEventIdx].body, null, 2)}
                          </pre>
                        </div>
                     </>
                  )}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
