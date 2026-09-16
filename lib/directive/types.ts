export interface PluginSidEntry {
  id: string; // React key, not the actual plugin_id
  plugin: string; // group identifier
  pluginId: number; // plugin_id
  sid: number; // plugin_sid (sequential)
  title: string; // exact match key
  category: string; // MITRE ATT&CK tactic
  kingdom: string; // MITRE ATT&CK phase
  rulesOverride?: StageRule[];
}

export interface StageRule {
  stage: number;
  occurrence: number;
  reliability: number;
  timeout: number;
  from: string;
  to: string;
  port_from: string;
  port_to: string;
  protocol: string;
  type: string;
  custom_data1: string;
  custom_data2: string;
  custom_data3: string;
}

export interface YamlConfig {
  tsvFileName: string;
  indexName: string;
  filterFieldName: string; // e.g., ".rule.name" or ".usecase.title_name"
  refererField: string; // lookup key field
  customData: { label: string; field: string }[]; // max 3
}

export interface DirectiveProject {
  id: string;
  name: string; // group name
  createdAt: string;
  updatedAt: string;
  indexName: string;
  pluginId: number;
  hasCustomUsecase: boolean;
  entries: PluginSidEntry[];
  yamlConfig: YamlConfig;
  customVrl?: string; // 60_custom-filter content
  generatedFiles: {
    directiveJson: string;
    pluginSidsTsv: string;
    yaml70: string;
    customVrl60?: string;
  };
}
