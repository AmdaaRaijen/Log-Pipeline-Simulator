"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FileSidebar } from "../../components/directive/FileSidebar";
import { StepIndicator } from "../../components/directive/StepIndicator";
import {
  MITRE_TACTICS,
  MITRE_KINGDOMS,
  genId,
} from "../../components/directive/UsecaseTable";
import { StepSetup } from "../../components/directive/StepSetup";
import { StepUsecaseTable } from "../../components/directive/StepUsecaseTable";
import { StepYamlConfig } from "../../components/directive/StepYamlConfig";

import type { OsType } from "../../lib/directive/paths";
import { StepVrlFilter } from "../../components/directive/StepVrlFilter";
import { StepReview } from "../../components/directive/StepReview";
import { FileViewer } from "../../components/directive/FileViewer";
import {
  generateDirectiveJSON,
  generatePluginSidsTSV,
  generate70Yaml,
} from "../../lib/directive/generator";
import type {
  DirectiveProject,
  PluginSidEntry,
  YamlConfig,
} from "../../lib/directive/types";
import { Save, ArrowLeft, ArrowRight } from "lucide-react";

// ─── LocalStorage helpers ─────────────────────────────────────────────────────
const STORAGE_KEY = "directive-projects";

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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DirectiveCreator() {
  const [projects, setProjects] = useState<DirectiveProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [viewingFile, setViewingFile] = useState<{
    content: string;
    language: string;
    name: string;
  } | null>(null);

  // Step 0 state
  const [group, setGroup] = useState("secdev");
  const [indexName, setIndexName] = useState("wazuh");
  const [pluginId, setPluginId] = useState<number>(45572);
  const [hasCustomUsecase, setHasCustomUsecase] = useState(false);
  const [existingTsv, setExistingTsv] = useState("");
  const [existingVrlContent, setExistingVrlContent] = useState("");
  const [osType, setOsType] = useState<OsType>("talos");

  // Step 1 state
  const [entries, setEntries] = useState<PluginSidEntry[]>([]);

  // Step 2 state
  const [yamlConfig, setYamlConfig] = useState<YamlConfig>({
    tsvFileName: "secdev_plugin-sids",
    indexName: "wazuh",
    filterFieldName: ".rule.name",
    refererField: ".usecase.title_name",
    customData: [{ label: "Action", field: ".action" }],
  });

  // Step 3 state
  const [vrlContent, setVrlContent] = useState("");
  const [vrlRawlog, setVrlRawlog] = useState(
    JSON.stringify({ rule: { name: "Suspicious activity" } }, null, 2),
  );
  const [vrlDesc, setVrlDesc] = useState("");
  const [vrlLoading, setVrlLoading] = useState(false);
  const [vrlTestResult, setVrlTestResult] = useState<any>(null);
  const [vrlGenResult, setVrlGenResult] = useState<{
    attempts: any[];
    error?: string;
  } | null>(null);

  // Step 4 state — must stay at top level (Rules of Hooks)
  const [generated, setGenerated] = useState<
    DirectiveProject["generatedFiles"] | null
  >(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  useEffect(() => {
    setYamlConfig((prev) => ({
      ...prev,
      tsvFileName: `${group}_plugin-sids`,
      indexName,
      refererField: hasCustomUsecase ? ".usecase.title_name" : ".rule.name",
      filterFieldName: hasCustomUsecase ? ".usecase.id" : ".rule.name",
    }));
  }, [group, indexName, hasCustomUsecase]);

  const parseTsvIntoEntries = (tsv: string): PluginSidEntry[] => {
    return tsv
      .trim()
      .split("\n")
      .filter((l) => l && !l.toLowerCase().startsWith("plugin"))
      .map((line, i) => {
        let p = line.split("\t");

        // If there are no tabs, try to parse space-aligned terminal output
        if (p.length < 4) {
          // Split by 2 or more spaces first
          p = line.split(/\s{2,}/);

          // If still not parsed well, try regex for: plugin id sid title category kingdom
          if (p.length < 4) {
            const match = line.match(
              /^(\S+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Za-z\s]+?)\s+([A-Za-z\s]+)$/,
            );
            if (match) {
              p = [match[1], match[2], match[3], match[4], match[5], match[6]];
            } else {
              // Last resort: simple space split
              p = line.split(/\s+/);
            }
          }
        }

        return {
          id: genId(),
          plugin: p[0] || group,
          pluginId: Number(p[1]) || pluginId,
          sid: Number(p[2]) || i + 1,
          title: p[3] ? p[3].trim() : "",
          category: p[4] ? p[4].trim() : MITRE_TACTICS[0],
          kingdom: p[5] ? p[5].trim() : MITRE_KINGDOMS[0],
        };
      });
  };

  const generateFiles = () => {
    const files: DirectiveProject["generatedFiles"] = {
      directiveJson: generateDirectiveJSON(entries, group),
      pluginSidsTsv: generatePluginSidsTSV(entries),
      yaml70: generate70Yaml(group, yamlConfig),
      customVrl60: hasCustomUsecase ? vrlContent : undefined,
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
    const updated =
      existingIdx >= 0
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

  const handleViewFile = (
    projectId: string,
    fileKey: keyof DirectiveProject["generatedFiles"],
  ) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
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
    setViewingFile({
      content: project.generatedFiles[fileKey] || "",
      language: langMap[fileKey],
      name: nameMap[fileKey],
    });
    setActiveProjectId(projectId);
  };

  const handleTestVrl = async () => {
    try {
      const parsedLog = JSON.parse(vrlRawlog);
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "vector",
          rawlog: parsedLog,
          pipelineConfig: vrlContent + "\n.",
        }),
      });
      setVrlTestResult(await res.json());
    } catch (e: any) {
      setVrlTestResult({ error: e.message });
    }
  };

  const handleGenerateVrl = async () => {
    setVrlLoading(true);
    setVrlGenResult(null);
    try {
      const parsedLog = JSON.parse(vrlRawlog);
      const nextSid =
        entries.length > 0 ? Math.max(...entries.map((e) => e.sid)) + 1 : 1;
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
        setVrlContent((prev) =>
          prev ? prev + "\n\n" + data.vrlBlock : data.vrlBlock,
        );
        setEntries((prev) => [
          ...prev,
          {
            id: genId(),
            plugin: group,
            pluginId,
            sid: nextSid,
            title: data.titleName || `Usecase ${nextSid}`,
            category: MITRE_TACTICS[0],
            kingdom: MITRE_KINGDOMS[0],
          },
        ]);
      }
      setVrlGenResult(data);
    } catch (e: any) {
      setVrlGenResult({ attempts: [], error: e.message });
    } finally {
      setVrlLoading(false);
    }
  };

  const canGoNext = () => {
    if (step === 0) return !!(group.trim() && indexName.trim() && pluginId > 0);
    if (step === 1)
      return entries.length > 0 && entries.every((e) => e.title.trim());
    return true;
  };

  const handleNext = () => {
    if (step === 0 && existingTsv.trim() && entries.length === 0) {
      setEntries(parseTsvIntoEntries(existingTsv));
    }

    if (step === 2 && !hasCustomUsecase) {
      generateFiles();
      setStep(4);
    } else if (step === 3) {
      generateFiles();
      setStep(4);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 4 && !hasCustomUsecase) setStep(2);
    else setStep((s) => Math.max(0, s - 1));
  };

  const renderStep = () => {
    if (step === 0)
      return (
        <StepSetup
          group={group}
          setGroup={setGroup}
          indexName={indexName}
          setIndexName={setIndexName}
          pluginId={pluginId}
          setPluginId={setPluginId}
          hasCustomUsecase={hasCustomUsecase}
          setHasCustomUsecase={setHasCustomUsecase}
          existingTsv={existingTsv}
          setExistingTsv={setExistingTsv}
          existingVrlContent={existingVrlContent}
          setExistingVrlContent={setExistingVrlContent}
          setVrlContent={setVrlContent}
          osType={osType}
          setOsType={setOsType}
        />
      );
    if (step === 1)
      return (
        <StepUsecaseTable
          entries={entries}
          group={group}
          pluginId={pluginId}
          hasCustomUsecase={hasCustomUsecase}
          setEntries={setEntries}
          yamlConfig={yamlConfig}
          setYamlConfig={setYamlConfig}
        />
      );
    if (step === 2)
      return (
        <StepYamlConfig
          group={group}
          yamlConfig={yamlConfig}
          setYamlConfig={setYamlConfig}
        />
      );
    if (step === 3)
      return (
        <StepVrlFilter
          group={group}
          vrlContent={vrlContent}
          setVrlContent={setVrlContent}
          vrlRawlog={vrlRawlog}
          setVrlRawlog={setVrlRawlog}
          vrlDesc={vrlDesc}
          setVrlDesc={setVrlDesc}
          vrlLoading={vrlLoading}
          vrlTestResult={vrlTestResult}
          vrlGenResult={vrlGenResult}
          onTestVrl={handleTestVrl}
          onGenerateVrl={handleGenerateVrl}
        />
      );
    if (step === 4 && generated)
      return (
        <StepReview
          group={group}
          indexName={indexName}
          files={generated}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onSave={handleSaveProject}
          osType={osType}
        />
      );
    return null;
  };

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 font-sans">
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-start px-4 gap-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="font-bold text-white tracking-wide">
            Directive Creator
          </h1>
          <div className="h-4 w-px bg-gray-700" />
          <nav className="flex items-center space-x-2">
            <Link
              href="/"
              className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              Whitelist Simulator
            </Link>
            <Link
              href="/filter"
              className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              Parser Simulator
            </Link>
            <Link
              href="/auto-whitelist"
              className="flex items-center text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              Auto Whitelist Creator
            </Link>
          </nav>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <FileSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProjectId}
          onDelete={handleDeleteProject}
          onNew={handleNewProject}
          viewFile={handleViewFile}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {viewingFile ? (
            <FileViewer
              {...viewingFile}
              onClose={() => setViewingFile(null)}
              osType={osType}
            />
          ) : (
            <>
              <div className="p-5 pb-3 border-b border-gray-800 bg-gray-950 flex-shrink-0">
                <StepIndicator
                  current={step}
                  hasCustomUsecase={hasCustomUsecase}
                />
              </div>
              <div className="flex-1 overflow-auto p-5">{renderStep()}</div>
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
                    {(step === 2 && !hasCustomUsecase) || step === 3
                      ? "Generate & Review"
                      : "Next"}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
