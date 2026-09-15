"use client";
import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import MonacoEditor from "../../components/editor/MonacoEditor";
import { generateDirectiveJSON, generatePluginSidsTSV, generate70Yaml } from "../../lib/directive/generator";
import type { DirectiveProject, PluginSidEntry, YamlConfig } from "../../lib/directive/types";
import {
  Plus, Trash2, ChevronRight, ChevronDown, FolderOpen, FileText,
  Download, Save, ArrowLeft, ArrowRight, Wand2, Play, Copy, Check,
  ShieldAlert, FileCode2, Settings, AlertTriangle, X
} from "lucide-react";

// ─── MITRE ATT&CK presets ───────────────────────────────────────────────────
const MITRE_TACTICS = [
  "Initial Access","Execution","Persistence","Privilege Escalation",
  "Defense Evasion","Credential Access","Discovery","Lateral Movement",
  "Collection","Command and Control","Exfiltration","Impact",
  "Reconnaissance","Resource Development","Exploit Public-Facing Application",
];
const MITRE_KINGDOMS = [
  "Initial Access","Execution","Persistence","Privilege Escalation",
  "Defense Evasion","Credential Access","Discovery","Lateral Movement",
  "Collection","Command and Control","Exfiltration","Impact",
];

const STORAGE_KEY = "directive-projects";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadProjects(): DirectiveProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProjects(projects: DirectiveProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

// ─── File Sidebar ────────────────────────────────────────────────────────────
function FileSidebar({
  projects,
  activeProjectId,
  onSelect,
  onDelete,
  onNew,
  viewFile,
}: {
  projects: DirectiveProject[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  viewFile: (projectId: string, fileKey: keyof DirectiveProject["generatedFiles"]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fileEntries: { key: keyof DirectiveProject["generatedFiles"]; label: string }[] = [
    { key: "pluginSidsTsv", label: "_plugin-sids.tsv" },
    { key: "directiveJson", label: "directives_dsiem-backend-0_.json" },
    { key: "yaml70", label: "70_dsiem-plugin_.yaml" },
    { key: "customVrl60", label: "60_custom-filter_.vrl" },
  ];

  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col text-sm flex-shrink-0">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <span className="font-semibold text-gray-300 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-blue-400" /> Projects
        </span>
        <button
          onClick={onNew}
          className="text-xs text-blue-400 hover:text-white flex items-center gap-1 hover:bg-gray-800 px-2 py-1 rounded transition-colors"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 && (
          <div className="p-4 text-gray-500 text-xs text-center">
            No projects yet.<br />Click "New" to create one.
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id}>
            <div
              className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer group hover:bg-gray-800 ${
                activeProjectId === p.id ? "bg-gray-800" : ""
              }`}
              onClick={() => { toggle(p.id); onSelect(p.id); }}
            >
              {expanded.has(p.id)
                ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
              <span className="text-yellow-400 text-xs">📁</span>
              <span className="text-gray-300 truncate flex-1 text-xs font-medium">{p.name}</span>
              <span className="text-gray-600 text-xs flex-shrink-0">({p.indexName})</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 ml-1 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {expanded.has(p.id) && (
              <div className="ml-6">
                {fileEntries.map(({ key, label }) => {
                  const content = p.generatedFiles[key];
                  if (!content) return null;
                  const displayName = `${p.name}${label}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                      onClick={() => viewFile(p.id, key)}
                    >
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate text-xs">{displayName}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────
const STEPS = [
  { label: "Setup", icon: Settings },
  { label: "Usecases", icon: ShieldAlert },
  { label: "YAML Config", icon: FileCode2 },
  { label: "VRL Filter", icon: FileCode2 },
  { label: "Review", icon: Download },
];

function StepIndicator({ current, hasCustomUsecase }: { current: number; hasCustomUsecase: boolean }) {
  const visibleSteps = hasCustomUsecase ? STEPS : STEPS.filter((_, i) => i !== 3);
  const visibleCurrent = hasCustomUsecase ? current : current > 3 ? current - 1 : current;

  return (
    <div className="flex items-center gap-0 mb-6">
      {visibleSteps.map((step, idx) => {
        const realIdx = hasCustomUsecase ? idx : idx >= 3 ? idx + 1 : idx;
        const isCurrent = realIdx === current;
        const isDone = realIdx < current;
        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isCurrent ? "bg-blue-600 text-white" :
                  isDone ? "bg-green-600 text-white" :
                  "bg-gray-700 text-gray-400"
                }`}
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-white" : "text-gray-500"}`}>
                {step.label}
              </span>
            </div>
            {idx < visibleSteps.length - 1 && (
              <div className={`h-px flex-1 mx-3 min-w-4 ${realIdx < current ? "bg-green-600" : "bg-gray-700"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Usecase Table ───────────────────────────────────────────────────────────
function UsecaseTable({
  entries,
  group,
  pluginId,
  onChange,
}: {
  entries: PluginSidEntry[];
  group: string;
  pluginId: number;
  onChange: (entries: PluginSidEntry[]) => void;
}) {
  const addRow = () => {
    const nextSid = entries.length > 0 ? Math.max(...entries.map((e) => e.sid)) + 1 : 1;
    onChange([
      ...entries,
      { id: genId(), plugin: group, pluginId, sid: nextSid, title: "", category: MITRE_TACTICS[0], kingdom: MITRE_KINGDOMS[0] },
    ]);
  };

  const updateRow = (id: string, field: keyof PluginSidEntry, value: any) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeRow = (id: string) => {
    const filtered = entries.filter((e) => e.id !== id);
    // Re-number SIDs
    onChange(filtered.map((e, i) => ({ ...e, sid: i + 1 })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800">
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-10">SID</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium">Title (exact match key)</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-48">Category (MITRE Tactic)</th>
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-48">Kingdom (MITRE Phase)</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={entry.id} className={`border-t border-gray-700 ${idx % 2 === 0 ? "bg-gray-900" : "bg-gray-950"}`}>
                <td className="px-3 py-1.5 text-gray-400 font-mono text-center">{entry.sid}</td>
                <td className="px-3 py-1.5">
                  <input
                    value={entry.title}
                    onChange={(e) => updateRow(entry.id, "title", e.target.value)}
                    placeholder="Exact usecase title..."
                    className="w-full bg-transparent text-gray-200 outline-none border-b border-transparent focus:border-blue-500 placeholder-gray-600 py-0.5 transition-colors"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={entry.category}
                    onChange={(e) => updateRow(entry.id, "category", e.target.value)}
                    className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
                  >
                    {MITRE_TACTICS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={entry.kingdom}
                    onChange={(e) => updateRow(entry.id, "kingdom", e.target.value)}
                    className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
                  >
                    {MITRE_KINGDOMS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <button onClick={() => removeRow(entry.id)} className="text-red-500 hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-600">No usecases yet. Click "Add Row" to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="self-start flex items-center gap-2 text-sm text-blue-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Row
      </button>
    </div>
  );
}

// ─── Copy button helper ───────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DirectiveCreator() {
  const [projects, setProjects] = useState<DirectiveProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Viewing a saved file in sidebar
  const [viewingFile, setViewingFile] = useState<{ content: string; language: string; name: string } | null>(null);

  // Step 1 state
  const [group, setGroup] = useState("secdev");
  const [indexName, setIndexName] = useState("wazuh");
  const [pluginId, setPluginId] = useState<number>(45572);
  const [hasCustomUsecase, setHasCustomUsecase] = useState(false);
  const [existingTsv, setExistingTsv] = useState("");
  const [existingVrlContent, setExistingVrlContent] = useState("");

  // Step 2 state
  const [entries, setEntries] = useState<PluginSidEntry[]>([]);

  // Step 3 state
  const [yamlConfig, setYamlConfig] = useState<YamlConfig>({
    tsvFileName: "secdev_plugin-sids",
    indexName: "wazuh",
    filterFieldName: ".rule.name",
    refererField: ".rule.name",
    customData: [{ label: "Action", field: ".action" }],
  });

  // Step 4 state
  const [vrlContent, setVrlContent] = useState("");
  const [vrlRawlog, setVrlRawlog] = useState(JSON.stringify({ rule: { name: "Suspicious activity" } }, null, 2));
  const [vrlDesc, setVrlDesc] = useState("");
  const [vrlLoading, setVrlLoading] = useState(false);
  const [vrlTestResult, setVrlTestResult] = useState<any>(null);
  const [vrlGenResult, setVrlGenResult] = useState<{ attempts: any[]; error?: string } | null>(null);

  // Generated content
  const [generated, setGenerated] = useState<DirectiveProject["generatedFiles"] | null>(null);

  // Step 5 (Review) tab state — must be top-level to respect Rules of Hooks
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  // Sync group/index to yamlConfig
  useEffect(() => {
    setYamlConfig((prev) => ({
      ...prev,
      tsvFileName: `${group}_plugin-sids`,
      indexName,
      refererField: hasCustomUsecase ? ".usecase.title_name" : ".rule.name",
      filterFieldName: hasCustomUsecase ? ".usecase.id" : ".rule.name",
    }));
  }, [group, indexName, hasCustomUsecase]);

  const parseTsvIntoEntries = (tsv: string) => {
    const lines = tsv.trim().split("\n").filter(Boolean);
    const dataLines = lines.filter((l) => !l.startsWith("plugin\t"));
    return dataLines.map((line, i) => {
      const parts = line.split("\t");
      return {
        id: genId(),
        plugin: parts[0] || group,
        pluginId: Number(parts[1]) || pluginId,
        sid: Number(parts[2]) || i + 1,
        title: parts[3] || "",
        category: parts[4] || MITRE_TACTICS[0],
        kingdom: parts[5] || MITRE_KINGDOMS[0],
      } as PluginSidEntry;
    });
  };

  const handleImportTsv = () => {
    if (!existingTsv.trim()) return;
    const parsed = parseTsvIntoEntries(existingTsv);
    setEntries(parsed);
  };

  const canGoNext = () => {
    if (step === 0) return group.trim() && indexName.trim() && pluginId > 0;
    if (step === 1) return entries.length > 0 && entries.every((e) => e.title.trim());
    if (step === 2) return yamlConfig.indexName.trim() && yamlConfig.filterFieldName.trim();
    if (step === 3) return true; // VRL is optional content but step always passable
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !hasCustomUsecase) {
      // Skip VRL step
      setStep(4);
    } else if (step === 2 && !hasCustomUsecase) {
      generateFiles();
      setStep(4);
    } else if (step === 3) {
      generateFiles();
      setStep(4);
    } else {
      if (step === 2 && hasCustomUsecase) {
        // Don't generate yet, go to VRL step
        setStep(3);
      } else {
        setStep((s) => s + 1);
      }
    }
  };

  const handleBack = () => {
    if (step === 4 && !hasCustomUsecase) {
      setStep(2);
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  };

  const generateFiles = () => {
    const directiveJson = generateDirectiveJSON(entries, group);
    const pluginSidsTsv = generatePluginSidsTSV(entries);
    const yaml70 = generate70Yaml(group, yamlConfig);
    const customVrl60 = hasCustomUsecase ? vrlContent : undefined;

    const files: DirectiveProject["generatedFiles"] = {
      directiveJson,
      pluginSidsTsv,
      yaml70,
      customVrl60,
    };
    setGenerated(files);
    return files;
  };

  const handleSaveProject = () => {
    const files = generated || generateFiles();
    const now = new Date().toISOString();
    const existingIdx = projects.findIndex((p) => p.id === activeProjectId);

    const project: DirectiveProject = {
      id: activeProjectId || genId(),
      name: group,
      createdAt: existingIdx >= 0 ? projects[existingIdx].createdAt : now,
      updatedAt: now,
      indexName,
      pluginId,
      hasCustomUsecase,
      entries,
      yamlConfig,
      customVrl: hasCustomUsecase ? vrlContent : undefined,
      generatedFiles: files,
    };

    const updated = existingIdx >= 0
      ? projects.map((p, i) => (i === existingIdx ? project : p))
      : [...projects, project];

    setProjects(updated);
    saveProjects(updated);
    setActiveProjectId(project.id);
    alert(`Project "${group}" saved!`);
  };

  const handleDeleteProject = (id: string) => {
    if (!confirm("Delete this project?")) return;
    const updated = projects.filter((p) => p.id !== id);
    setProjects(updated);
    saveProjects(updated);
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const handleNewProject = () => {
    setActiveProjectId(null);
    setStep(0);
    setGroup("secdev");
    setIndexName("wazuh");
    setPluginId(45572);
    setHasCustomUsecase(false);
    setExistingTsv("");
    setExistingVrlContent("");
    setEntries([]);
    setVrlContent("");
    setVrlGenResult(null);
    setGenerated(null);
    setViewingFile(null);
  };

  const handleViewFile = (projectId: string, fileKey: keyof DirectiveProject["generatedFiles"]) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const content = project.generatedFiles[fileKey] || "";
    const langMap: Record<string, string> = {
      directiveJson: "json",
      pluginSidsTsv: "plaintext",
      yaml70: "yaml",
      customVrl60: "plaintext",
    };
    const nameMap: Record<string, string> = {
      directiveJson: `directives_dsiem-backend-0_${project.name}.json`,
      pluginSidsTsv: `${project.name}_plugin-sids.tsv`,
      yaml70: `70_dsiem-plugin_${project.name}.yaml`,
      customVrl60: `60_custom-filter_${project.name}.vrl`,
    };
    setViewingFile({ content, language: langMap[fileKey], name: nameMap[fileKey] });
    setActiveProjectId(projectId);
  };

  const handleTestVrl = async () => {
    try {
      const parsedLog = JSON.parse(vrlRawlog);
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: "vector", rawlog: parsedLog, pipelineConfig: vrlContent + "\n." }),
      });
      const data = await res.json();
      setVrlTestResult(data);
    } catch (e: any) {
      setVrlTestResult({ error: e.message });
    }
  };

  const handleGenerateVrl = async () => {
    setVrlLoading(true);
    setVrlGenResult(null);
    try {
      const parsedLog = JSON.parse(vrlRawlog);
      const nextSid = entries.length > 0 ? Math.max(...entries.map((e) => e.sid)) + 1 : 1;
      const res = await fetch("/api/directive-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawlog: parsedLog,
          description: vrlDesc,
          existingVrl: vrlContent,
          nextSid,
          maxRetries: 3,
        }),
      });
      const data = await res.json();
      if (data.success && data.vrlBlock) {
        setVrlContent((prev) => (prev ? prev + "\n\n" + data.vrlBlock : data.vrlBlock));
        // Add new entry to table
        const newEntry: PluginSidEntry = {
          id: genId(),
          plugin: group,
          pluginId,
          sid: nextSid,
          title: data.titleName || `Usecase ${nextSid}`,
          category: MITRE_TACTICS[0],
          kingdom: MITRE_KINGDOMS[0],
        };
        setEntries((prev) => [...prev, newEntry]);
      }
      setVrlGenResult(data);
    } catch (e: any) {
      setVrlGenResult({ attempts: [], error: e.message });
    } finally {
      setVrlLoading(false);
    }
  };

  // ── Render views ──────────────────────────────────────────────────────────
  const mainContent = () => {
    // If viewing a file from sidebar
    if (viewingFile) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-3 bg-gray-950 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <button onClick={() => setViewingFile(null)} className="text-gray-400 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-mono text-gray-300">{viewingFile.name}</span>
            </div>
            <CopyButton text={viewingFile.content} />
          </div>
          <div className="flex-1 p-3">
            <MonacoEditor
              value={viewingFile.content}
              onChange={() => {}}
              language={viewingFile.language}
              path={viewingFile.name}
            />
          </div>
        </div>
      );
    }

    // ── Step 0: Project Setup ──────────────────────────────────────────────
    if (step === 0) return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Project Setup</h2>
          <p className="text-sm text-gray-400">Define the basic parameters for your DSIEM directive group.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Group Name *</label>
            <input value={group} onChange={(e) => setGroup(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="e.g. secdev" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Plugin ID *</label>
            <input type="number" value={pluginId} onChange={(e) => setPluginId(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="e.g. 45572" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Index Name *</label>
            <input value={indexName} onChange={(e) => setIndexName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="e.g. wazuh, imperva, google-workspace" />
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 p-4 bg-gray-900">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-11 h-6 rounded-full relative transition-colors ${hasCustomUsecase ? "bg-blue-600" : "bg-gray-700"}`}
              onClick={() => setHasCustomUsecase((v) => !v)}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${hasCustomUsecase ? "translate-x-6" : "translate-x-1"}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-white">Custom Usecase (60_custom-filter)</div>
              <div className="text-xs text-gray-400">Enable if log source needs custom VRL usecase tagging logic</div>
            </div>
          </label>
        </div>

        {hasCustomUsecase && (
          <div className="space-y-4 rounded-lg border border-blue-800 bg-blue-950/30 p-4">
            <div className="flex items-start gap-2 text-blue-300 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>Jika sudah ada custom usecase yang perlu dilanjutkan, jalankan perintah berikut di server dan paste hasilnya di bawah:</span>
            </div>
            <div className="bg-gray-900 rounded p-3 text-xs font-mono text-green-400 border border-gray-700">
              <div>cat /root/data/mgmt/kubeappl/vector-parser/configs/<span className="text-yellow-300">{indexName}</span>/60_custom-filter_<span className="text-yellow-300">{group}</span>.vrl</div>
              <div className="mt-1">cat /etc/dsiem-plugin-tsv/<span className="text-yellow-300">{group}</span>_plugin-sids.tsv</div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Existing plugin-sids.tsv (optional — paste to continue)</label>
              <textarea value={existingTsv} onChange={(e) => setExistingTsv(e.target.value)} rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
                placeholder="plugin&#9;id&#9;sid&#9;title&#9;category&#9;kingdom&#10;mygroup&#9;45572&#9;1&#9;Usecase title..." />
              {existingTsv && (
                <button onClick={handleImportTsv} className="mt-1 text-xs text-blue-400 hover:text-blue-300">
                  → Import into Usecase Table
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Existing 60_custom-filter VRL (optional — paste to continue)</label>
              <textarea value={existingVrlContent} onChange={(e) => { setExistingVrlContent(e.target.value); setVrlContent(e.target.value); }} rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
                placeholder="# existing VRL content..." />
            </div>
          </div>
        )}
      </div>
    );

    // ── Step 1: Usecase Table ──────────────────────────────────────────────
    if (step === 1) return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Usecase Table</h2>
          <p className="text-sm text-gray-400">
            Define each usecase. The <span className="text-yellow-300 font-mono">Title</span> must exactly match the field value that will be looked up in the enrichment table.
            {hasCustomUsecase && <span className="text-blue-300"> For custom VRL usecases, title must match <code className="bg-gray-800 px-1 rounded">.usecase.title_name</code>.</span>}
          </p>
        </div>
        <UsecaseTable entries={entries} group={group} pluginId={pluginId} onChange={setEntries} />
        <div className="text-xs text-gray-500">
          Plugin ID: <span className="text-gray-300 font-mono">{pluginId}</span> · Group: <span className="text-gray-300 font-mono">{group}</span> ·
          Directive ID formula: <span className="text-gray-300 font-mono">{pluginId}000{"{sid}"}</span>
        </div>
      </div>
    );

    // ── Step 2: YAML Config ────────────────────────────────────────────────
    if (step === 2) {
      const previewYaml = generate70Yaml(group, yamlConfig);
      return (
        <div className="grid grid-cols-2 gap-6 h-full">
          <div className="space-y-4 overflow-y-auto pr-2">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">YAML Configuration</h2>
              <p className="text-sm text-gray-400">Fill in the placeholders for <code className="bg-gray-800 px-1 rounded text-xs">70_dsiem-plugin_{group}.yaml</code>.</p>
            </div>

            {[
              { label: "TSV File Name", key: "tsvFileName" as keyof YamlConfig, placeholder: "secdev_plugin-sids" },
              { label: "Index Name", key: "indexName" as keyof YamlConfig, placeholder: "wazuh" },
              { label: "Filter Field (must exist)", key: "filterFieldName" as keyof YamlConfig, placeholder: ".rule.name or .usecase.id" },
              { label: "Referer Field (lookup key)", key: "refererField" as keyof YamlConfig, placeholder: ".rule.name or .usecase.title_name" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  value={yamlConfig[key] as string}
                  onChange={(e) => setYamlConfig((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono text-gray-300 focus:border-blue-500 focus:outline-none"
                  placeholder={placeholder}
                />
              </div>
            ))}

            <div>
              <label className="block text-xs text-gray-400 mb-2">Custom Data Fields (max 3)</label>
              {yamlConfig.customData.map((cd, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input value={cd.label} onChange={(e) => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.map((d, j) => j === i ? { ...d, label: e.target.value } : d) }))}
                    placeholder="Label (e.g. Action)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-300 focus:border-blue-500 focus:outline-none" />
                  <input value={cd.field} onChange={(e) => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.map((d, j) => j === i ? { ...d, field: e.target.value } : d) }))}
                    placeholder="Field (e.g. .action)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs font-mono text-gray-300 focus:border-blue-500 focus:outline-none" />
                  <button onClick={() => setYamlConfig((prev) => ({ ...prev, customData: prev.customData.filter((_, j) => j !== i) }))}
                    className="text-red-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {yamlConfig.customData.length < 3 && (
                <button onClick={() => setYamlConfig((prev) => ({ ...prev, customData: [...prev.customData, { label: "", field: "" }] }))}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add Field
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-semibold">Live Preview — 70_dsiem-plugin_{group}.yaml</span>
              <CopyButton text={previewYaml} />
            </div>
            <div className="flex-1 min-h-0">
              <MonacoEditor value={previewYaml} onChange={() => {}} language="yaml" path="preview-70.yaml" />
            </div>
          </div>
        </div>
      );
    }

    // ── Step 3: Custom VRL ─────────────────────────────────────────────────
    if (step === 3) return (
      <div className="grid grid-cols-2 gap-4 h-full">
        {/* Left: VRL Editor */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">60_custom-filter_{group}.vrl</span>
            <CopyButton text={vrlContent} />
          </div>
          <div className="flex-1 min-h-0">
            <MonacoEditor value={vrlContent} onChange={(v) => setVrlContent(v || "")} language="plaintext" path="60-filter.vrl" />
          </div>
          {!vrlContent && (
            <button
              onClick={() => setVrlContent(`# Template — add your usecase blocks below\n# Pattern:\n# if !exists(.usecase.id) && (<condition>) {\n#   .usecase.author     = "analyst"\n#   .usecase.id         = "1"\n#   .usecase.title_name = "Exact title matching TSV"\n#   .usecase.type       = "Custom"\n#   .usecase.description = "What this detects."\n# }\n`)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              → Insert template
            </button>
          )}
        </div>

        {/* Right: Test + Generate */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-gray-700 p-3 bg-gray-900 flex flex-col gap-3">
            <span className="text-xs font-semibold text-gray-300">🤖 Auto-Generate Usecase with AI</span>
            <textarea
              value={vrlDesc}
              onChange={(e) => setVrlDesc(e.target.value)}
              rows={2}
              placeholder="Describe what this usecase should detect..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleGenerateVrl}
              disabled={vrlLoading || !vrlDesc.trim()}
              className="flex items-center gap-2 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors self-start"
            >
              <Wand2 className="h-3 w-3" />
              {vrlLoading ? "Generating..." : "Generate & Append"}
            </button>

            {vrlGenResult && (
              <div className={`text-xs p-2 rounded ${vrlGenResult.error ? "bg-red-950 text-red-300 border border-red-800" : "bg-green-950 text-green-300 border border-green-800"}`}>
                {vrlGenResult.error
                  ? `Error: ${vrlGenResult.error}`
                  : `✓ Generated! ${(vrlGenResult as any).explanation || ""}`}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-700 p-3 bg-gray-900 flex flex-col gap-2 flex-1">
            <span className="text-xs font-semibold text-gray-300">🧪 Test VRL Against Raw Log</span>
            <div className="flex-1 min-h-0 h-40">
              <MonacoEditor value={vrlRawlog} onChange={(v) => setVrlRawlog(v || "")} language="json" path="vrl-test-rawlog.json" />
            </div>
            <button
              onClick={handleTestVrl}
              className="flex items-center gap-2 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md transition-colors self-start"
            >
              <Play className="h-3 w-3" /> Test VRL
            </button>
            {vrlTestResult && (
              <div className={`text-xs p-2 rounded font-mono overflow-auto max-h-32 ${vrlTestResult.error ? "bg-red-950 text-red-300 border border-red-800" : "bg-gray-800 text-gray-300"}`}>
                {JSON.stringify(vrlTestResult, null, 2)}
              </div>
            )}
          </div>
        </div>
      </div>
    );

    // ── Step 4: Review ─────────────────────────────────────────────────────
    if (step === 4) {
      const files = generated || generateFiles();
      const fileList = [
        { label: `${group}_plugin-sids.tsv`, content: files.pluginSidsTsv, lang: "plaintext" },
        { label: `directives_dsiem-backend-0_${group}.json`, content: files.directiveJson, lang: "json" },
        { label: `70_dsiem-plugin_${group}.yaml`, content: files.yaml70, lang: "yaml" },
        ...(files.customVrl60 ? [{ label: `60_custom-filter_${group}.vrl`, content: files.customVrl60, lang: "plaintext" }] : []),
      ];


      return (
        <div className="flex flex-col gap-3 h-full">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Review & Export</h2>
              <p className="text-sm text-gray-400">All files generated. Copy or save the project.</p>
            </div>
            <button
              onClick={handleSaveProject}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <Save className="h-4 w-4" /> Save Project
            </button>
          </div>

          <div className="flex gap-1">
            {fileList.map((f, i) => (
              <button key={i}
                onClick={() => setActiveTab(i)}
                className={`px-3 py-1.5 text-xs rounded-t-md font-medium transition-colors ${activeTab === i ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-500 hover:text-gray-300"}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-0">
            <div className="flex justify-end">
              <CopyButton text={fileList[activeTab]?.content || ""} />
            </div>
            <div className="flex-1 min-h-0">
              <MonacoEditor
                value={fileList[activeTab]?.content || ""}
                onChange={() => {}}
                language={fileList[activeTab]?.lang || "plaintext"}
                path={fileList[activeTab]?.label}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-xs text-gray-400 space-y-1">
            <div className="text-gray-300 font-semibold mb-2">📋 Deployment Checklist</div>
            <div>1. Copy <span className="text-yellow-300 font-mono">{group}_plugin-sids.tsv</span> → <span className="font-mono">/root/data/nfs/pvc-&#123;uuid&#125;/dsiem-plugin-tsv/</span></div>
            <div>2. Deploy <span className="text-yellow-300 font-mono">directives_dsiem-backend-0_{group}.json</span> → dsiem-frontend pod: <span className="font-mono">dsiem/configs/</span></div>
            <div>3. Deploy <span className="text-yellow-300 font-mono">70_dsiem-plugin_{group}.yaml</span> → <span className="font-mono">/root/data/mgmt/kubeappl/vector-parser/configs/{indexName}/</span></div>
            {files.customVrl60 && <div>4. Deploy <span className="text-yellow-300 font-mono">60_custom-filter_{group}.vrl</span> → same vector-parser configs folder</div>}
            <div className="pt-1">5. Restart: <span className="font-mono">kubectl delete pod vector-parser{"<Tab>"}; kubectl delete pod -l app=dsiem-backend</span></div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      {/* Navbar */}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-start px-4 gap-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="font-bold text-white tracking-wide">Directive Creator</h1>
          <div className="h-4 w-px bg-gray-700" />
          <nav className="flex items-center space-x-2">
            <Link href="/" className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
              Whitelist Simulator
            </Link>
            <Link href="/filter" className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
              Parser Simulator
            </Link>
            <Link href="/auto-whitelist" className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
              Auto Whitelist Creator
            </Link>
          </nav>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <FileSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProjectId}
          onDelete={handleDeleteProject}
          onNew={handleNewProject}
          viewFile={handleViewFile}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!viewingFile && (
            <div className="p-5 pb-3 border-b border-gray-800 bg-gray-950 flex-shrink-0">
              <StepIndicator current={step} hasCustomUsecase={hasCustomUsecase} />
            </div>
          )}

          <div className={`flex-1 overflow-auto ${viewingFile ? "" : "p-5"}`}>
            {mainContent()}
          </div>

          {!viewingFile && (
            <div className="p-4 border-t border-gray-800 bg-gray-950 flex justify-between flex-shrink-0">
              <button
                onClick={handleBack}
                disabled={step === 0}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-800 px-3 py-1.5 rounded-md transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              {step < 4 ? (
                <button
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-md transition-colors font-medium"
                >
                  {step === 2 && !hasCustomUsecase ? "Generate & Review" : step === 3 ? "Generate & Review" : "Next"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSaveProject}
                  className="flex items-center gap-2 text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-1.5 rounded-md transition-colors font-medium"
                >
                  <Save className="h-4 w-4" /> Save Project
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
