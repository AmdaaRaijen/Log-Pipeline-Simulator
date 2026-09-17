"use client";
import React, { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { getDeploymentPaths, type OsType } from "../../lib/directive/paths";

export function StepSetup({
  group,
  setGroup,
  indexName,
  setIndexName,
  pluginId,
  setPluginId,
  osType,
  setOsType,
  hasCustomUsecase,
  setHasCustomUsecase,
  existingTsv,
  setExistingTsv,
  existingVrlContent,
  setExistingVrlContent,
  setVrlContent,
}: {
  group: string;
  setGroup: (v: string) => void;
  indexName: string;
  setIndexName: (v: string) => void;
  pluginId: number;
  setPluginId: (v: number) => void;
  osType: OsType;
  setOsType: (v: OsType) => void;
  hasCustomUsecase: boolean;
  setHasCustomUsecase: (v: boolean) => void;
  existingTsv: string;
  setExistingTsv: (v: string) => void;
  existingVrlContent: string;
  setExistingVrlContent: (v: string) => void;
  setVrlContent: (v: string) => void;
}) {
  const paths = getDeploymentPaths(osType, group, indexName);
  
  const [plugins, setPlugins] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    fetch("/api/directive/plugins")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPlugins(data);
      })
      .catch((err) => console.error("Failed to load plugins", err));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Project Setup</h2>
        <p className="text-sm text-gray-400">
          Define the basic parameters for your DSIEM directive group.
        </p>
      </div>

      <div className="flex gap-4 mb-2 bg-gray-900 border border-gray-800 p-3 rounded-lg">
        <span className="text-sm font-medium text-gray-400">Target Environment:</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={osType === "talos"} onChange={() => setOsType("talos")} className="accent-blue-500" />
          <span className="text-sm text-gray-300">Talos OS</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={osType === "centos"} onChange={() => setOsType("centos")} className="accent-blue-500" />
          <span className="text-sm text-gray-300">Centos OS</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="relative">
          <label className="block text-xs text-gray-400 mb-1">
            Group Name *
          </label>
          <input
            value={group}
            onChange={(e) => { setGroup(e.target.value); setIsDropdownOpen(true); }}
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="e.g. secdev"
          />
          {isDropdownOpen && plugins.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-2xl max-h-60 overflow-y-auto">
              {plugins
                .filter((p) =>
                  p.siem_plugin_type.toLowerCase().includes(group.toLowerCase())
                )
                .map((p) => (
                  <div
                    key={p.plugin_id}
                    className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 cursor-pointer border-b border-gray-800 flex flex-col"
                    onClick={() => {
                      setGroup(p.siem_plugin_type);
                      setPluginId(p.plugin_id);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <span className="font-semibold">{p.siem_plugin_type || p.filter}</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      ID: <span className="text-blue-400">{p.plugin_id}</span> | By: {p.by}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Plugin ID *
          </label>
          <input
            type="number"
            value={pluginId || ""}
            onChange={(e) => setPluginId(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="e.g. 45572"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">
            Index Name *
          </label>
          <input
            value={indexName}
            onChange={(e) => setIndexName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="e.g. wazuh, imperva, google-workspace"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Existing plugin-sids.tsv (optional — paste to continue)
        </label>
        <div className="mb-2 text-xs font-mono text-green-400 bg-gray-900 p-2 rounded border border-gray-700">
          {paths.tsv.search && (
            <div className="text-gray-500"># {paths.tsv.search}</div>
          )}
          <div>cat {paths.tsv.dest}<span className="text-yellow-300">{group}</span>_plugin-sids.tsv</div>
        </div>
        <textarea
          value={existingTsv}
          onChange={(e) => setExistingTsv(e.target.value)}
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
          placeholder={
            "plugin\tid\tsid\ttitle\tcategory\tkingdom\nmygroup\t45572\t1\tUsecase title..."
          }
        />
      </div>

      <div className="rounded-lg border border-gray-700 p-4 bg-gray-900">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`w-11 h-6 rounded-full relative transition-colors ${hasCustomUsecase ? "bg-blue-600" : "bg-gray-700"}`}
            onClick={() => setHasCustomUsecase(!hasCustomUsecase)}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${hasCustomUsecase ? "translate-x-6" : "translate-x-1"}`}
            />
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              Custom Usecase (60_custom-filter)
            </div>
            <div className="text-xs text-gray-400">
              Enable if log source needs custom VRL usecase tagging logic
            </div>
          </div>
        </label>
      </div>

      {hasCustomUsecase && (
        <div className="space-y-4 rounded-lg border border-blue-800 bg-blue-950/30 p-4">
          <div className="flex items-start gap-2 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Jika sudah ada custom usecase yang perlu dilanjutkan, jalankan
              perintah berikut di server dan paste hasilnya di bawah:
            </span>
          </div>
          <div className="bg-gray-900 rounded p-3 text-xs font-mono text-green-400 border border-gray-700">
            <div>
              cat {paths.vrl.dest}60_custom-filter_<span className="text-yellow-300">{group}</span>.vrl
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Existing 60_custom-filter VRL (optional — paste to continue)
            </label>
            <textarea
              value={existingVrlContent}
              onChange={(e) => {
                setExistingVrlContent(e.target.value);
                setVrlContent(e.target.value);
                console.log("StepSetup.tsx, setExistingVrlContent");
              }}
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
              placeholder="# existing VRL content..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
