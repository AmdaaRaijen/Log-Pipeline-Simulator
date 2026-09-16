"use client";
import React, { useState, useEffect } from "react";
import type { PluginSidEntry, StageRule } from "../../lib/directive/types";

interface DirectiveEditModalProps {
  entry: PluginSidEntry;
  onSave: (updatedEntry: PluginSidEntry) => void;
  onClose: () => void;
}

const defaultRules = (): StageRule[] => [
  { stage: 1, occurrence: 1,      reliability: 6,  timeout: 300,   from: "ANY", to: "ANY", port_from: "ANY", port_to: "ANY", protocol: "ANY", type: "PluginRule", custom_data1: "ANY", custom_data2: "ANY", custom_data3: "ANY" },
  { stage: 2, occurrence: 10,     reliability: 7,  timeout: 3600,  from: ":1",  to: "ANY", port_from: "ANY", port_to: "ANY", protocol: "ANY", type: "PluginRule", custom_data1: "ANY", custom_data2: "ANY", custom_data3: "ANY" },
  { stage: 3, occurrence: 100000, reliability: 10, timeout: 86400, from: ":1",  to: "ANY", port_from: "ANY", port_to: "ANY", protocol: "ANY", type: "PluginRule", custom_data1: "ANY", custom_data2: "ANY", custom_data3: "ANY" },
];

export function DirectiveEditModal({
  entry,
  onSave,
  onClose,
}: DirectiveEditModalProps) {
  const [rules, setRules] = useState<StageRule[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    // Copy the rules so we can mutate them in state
    const initialRules = entry.rulesOverride
      ? JSON.parse(JSON.stringify(entry.rulesOverride))
      : defaultRules();
    setRules(initialRules);
  }, [entry]);

  const updateRule = (stageIdx: number, field: keyof StageRule, value: any) => {
    setRules((prev) =>
      prev.map((r, i) => (i === stageIdx ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = () => {
    // Basic validation: ensure no field is empty (except perhaps those that can literally be empty, but usually "ANY" is used)
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (
        r.occurrence === undefined ||
        r.reliability === undefined ||
        r.timeout === undefined ||
        !r.from ||
        !r.to ||
        !r.port_from ||
        !r.port_to ||
        !r.protocol ||
        !r.type ||
        !r.custom_data1 ||
        !r.custom_data2 ||
        !r.custom_data3
      ) {
        setError(`Stage ${i + 1} has empty fields. Use "ANY" if not applicable.`);
        return;
      }
    }
    
    // Ensure numbers are actually numbers
    const processedRules = rules.map(r => ({
      ...r,
      occurrence: Number(r.occurrence),
      reliability: Number(r.reliability),
      timeout: Number(r.timeout),
    }));

    onSave({ ...entry, rulesOverride: processedRules });
  };

  const handleReset = () => {
    onSave({ ...entry, rulesOverride: undefined });
  };

  const renderField = (stageIdx: number, label: string, fieldKey: keyof StageRule, isNumber: boolean = false) => {
    const val = rules[stageIdx]?.[fieldKey];
    return (
      <div className="flex flex-col mb-2">
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{label}</label>
        <input
          type={isNumber ? "number" : "text"}
          value={val !== undefined ? val : ""}
          onChange={(e) => updateRule(stageIdx, fieldKey, isNumber ? Number(e.target.value) : e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
    );
  };

  if (rules.length !== 3) return null; // loading state essentially

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-gray-200 font-bold text-lg">Edit Directive Rules</h2>
            <p className="text-gray-400 text-xs mt-1">Configure Stage 1, 2, and 3 parameters.</p>
          </div>
          <span className="text-gray-400 text-sm font-mono bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-lg">
            {entry.title} <span className="text-gray-600">({entry.sid})</span>
          </span>
        </div>

        {/* Info Box */}
        <div className="px-4 py-3 bg-blue-950/20 border-b border-blue-900/30 flex-shrink-0">
          <div className="text-xs text-blue-300 flex flex-col gap-1">
            <span>
              <strong>Tip:</strong> To correlate by actor/user instead of IP (e.g. when IP is <code>0.0.0.0</code>), 
              change <code className="bg-gray-800 px-1 rounded text-green-300">Custom Data 1</code> on Stage 2 and 3 to <code className="bg-gray-800 px-1 rounded text-green-300">":1"</code>.
            </span>
          </div>
        </div>

        {/* 3-Column Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-4">
            {rules.map((rule, idx) => (
              <div key={idx} className="bg-gray-950 border border-gray-800 rounded-lg p-4 flex flex-col gap-4">
                <div className="border-b border-gray-800 pb-2 mb-2">
                  <h3 className="text-white font-semibold text-sm">Stage {rule.stage}</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-blue-400 text-xs font-semibold mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 bg-blue-500 rounded-full"></span> Threshold & Timing
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {renderField(idx, "Occurrence", "occurrence", true)}
                      {renderField(idx, "Reliability", "reliability", true)}
                      <div className="col-span-2">
                        {renderField(idx, "Timeout (s)", "timeout", true)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-purple-400 text-xs font-semibold mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 bg-purple-500 rounded-full"></span> Network
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {renderField(idx, "From (Src)", "from")}
                      {renderField(idx, "To (Dst)", "to")}
                      {renderField(idx, "Port From", "port_from")}
                      {renderField(idx, "Port To", "port_to")}
                      <div className="col-span-2">
                        {renderField(idx, "Protocol", "protocol")}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 bg-green-500 rounded-full"></span> Correlation (Custom Data)
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {renderField(idx, "Custom Data 1", "custom_data1")}
                      {renderField(idx, "Custom Data 2", "custom_data2")}
                      {renderField(idx, "Custom Data 3", "custom_data3")}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-orange-400 text-xs font-semibold mb-2 flex items-center gap-2">
                      <span className="w-1 h-3 bg-orange-500 rounded-full"></span> Misc
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {renderField(idx, "Type", "type")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-between items-center flex-shrink-0 rounded-b-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReset}
              className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Reset to defaults
            </button>
            {error && <span className="text-red-400 text-xs font-medium">{error}</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
            >
              Save Rules
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
