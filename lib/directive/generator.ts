import { PluginSidEntry, YamlConfig } from "./types";

export function generateDirectiveJSON(entries: PluginSidEntry[], group: string) {
  const directives = entries.map((entry) => {
    const directive_id = Number(`${entry.pluginId}000${entry.sid}`);
    const name = `${group.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}, ${entry.title}`;

    const field_stages = [
      { occurrence: 1, reliability: 6, timeout: 300, from: "ANY" },
      { occurrence: 10, reliability: 7, timeout: 3600, from: ":1" },
      { occurrence: 100000, reliability: 10, timeout: 86400, from: ":1" },
    ];

    const rules = field_stages.map((stage, i) => ({
      stage: i + 1,
      name: entry.title,
      plugin_id: entry.pluginId,
      plugin_sid: [entry.sid],
      occurrence: stage.occurrence,
      reliability: stage.reliability,
      timeout: stage.timeout,
      from: stage.from,
      to: "ANY",
      port_from: "ANY",
      port_to: "ANY",
      protocol: "ANY",
      type: "PluginRule",
      custom_data1: "ANY",
      custom_data2: "ANY",
      custom_data3: "ANY",
    }));

    return {
      id: directive_id,
      name,
      category: entry.category,
      kingdom: entry.kingdom,
      priority: 3,
      all_rules_always_active: false,
      disabled: false,
      rules,
    };
  });

  return JSON.stringify({ directives }, null, 4);
}

export function generatePluginSidsTSV(entries: PluginSidEntry[]) {
  const headers = ["plugin", "id", "sid", "title", "category", "kingdom"];
  const rows = entries.map((e) => [
    e.plugin,
    e.pluginId.toString(),
    e.sid.toString(),
    e.title,
    e.category,
    e.kingdom,
  ]);
  
  const lines = [headers.join("\t"), ...rows.map((r) => r.join("\t"))];
  return lines.join("\n");
}

export function generate70Yaml(group: string, config: YamlConfig) {
  let template = `enrichment_tables:
  enrichment-table_plugin-sid_CONFIG_ID:
    type: "file"
    file:
      path: "/etc/dsiem-plugin-tsv/{__TSV_FILE_NAME__}.tsv"
      encoding:
        type: "csv"
        delimiter: "\\t"
    schema:
      plugin: "string"
      id: "integer"
      sid: "integer"
      title: "string"

transforms:
  filter_dsiem-plugin_CONFIG_ID:
    type: filter
    inputs:
      - 98_output_to_dsiem_CONFIG_ID.siem_events
    condition:
      type: "vrl"
      source: |-
        match(string!(.index_name), r'(?i){__INDEX_NAME__}') && exists({__FILTER_FIELD_NAME_OPTIONAL__})

  transform_dsiem-plugin_CONFIG_ID:
    type: remap
    inputs:
      - filter_dsiem-plugin_CONFIG_ID
    drop_on_abort: true
    drop_on_error: true
    source: |-
      norm_event.sensor = "CONFIG_ID"
      norm_event.timestamp = .timestamp
      norm_event.@timestamp = .@timestamp
      norm_event.src_ip = .source.ip
      norm_event.dst_ip = .destination.ip
      norm_event.src_port = .source.port
      norm_event.dst_port = .destination.port
      norm_event.protocol = "TCP/IP"
      norm_event.product = .observer.vendor
      norm_event.category = "CONFIG_ID" #adjust as needed
      norm_event.subcategory = "CONFIG_ID" #adjust as needed
      row, err = get_enrichment_table_record("enrichment-table_plugin-sid_CONFIG_ID", { "title": {__REFERER_FIELD_TO_BE_RULE_NAME__} })
      if err != null {
        abort
      }
      norm_event.plugin_id = row.id
      norm_event.plugin_sid = row.sid
      norm_event.title = row.title
      . = norm_event
      .index_name = "siem_events"
      .event_id = uuid_v4()`;

  // Process custom data fields
  const customDataLines = config.customData
    .slice(0, 3)
    .map(
      (data, idx) =>
        `      norm_event.custom_label${idx + 1} = "${data.label}"\n      norm_event.custom_data${idx + 1} = ${data.field}`
    )
    .join("\n");

  if (customDataLines) {
    template = template.replace(
      `      norm_event.title = row.title`,
      `${customDataLines}\n      norm_event.title = row.title`
    );
  }

  // Replace placeholders
  template = template
    .replace(/CONFIG_ID/g, group)
    .replace(/{__TSV_FILE_NAME__}/g, config.tsvFileName)
    .replace(/{__INDEX_NAME__}/g, config.indexName)
    .replace(/{__FILTER_FIELD_NAME_OPTIONAL__}/g, config.filterFieldName)
    .replace(/{__REFERER_FIELD_TO_BE_RULE_NAME__}/g, config.refererField);

  return template;
}
