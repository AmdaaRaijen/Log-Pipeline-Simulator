export type FieldPath = string[]; // e.g., ["indicators", "value"]

export type Condition =
  | { type: "regexMatch"; field: FieldPath; pattern: string; flags: string; negate: boolean }
  | { type: "equals"; field: FieldPath; value: string; negate: boolean }
  | { type: "in"; field: FieldPath; values: string[]; negate: boolean }
  | { type: "inFieldRef"; leftField: FieldPath | string; rightField: FieldPath; negate: boolean } // E.g., "_jsonparsefailure" in [tags]
  | { type: "truthy"; field: FieldPath; negate: boolean } // E.g., if [impactScope] or if ![impactScope]
  | { type: "and"; left: Condition; right: Condition }
  | { type: "or"; left: Condition; right: Condition }
  | { type: "not"; inner: Condition };

// V1 Mutate Actions (for Exclude Simulator backward compatibility)
export type MutateAction = { 
  type: "addField"; 
  fields: Record<string, string>; 
};

// V1 Pipeline AST (Exclude Simulator)
export type Rule = {
  condition: Condition | null; // null = "else" branch without condition
  actions: MutateAction[];
  sourceLine: number;
  branchIndex: number;
};

export type ParsedPipeline = {
  filters: Rule[]; // executed top-down, stops at first match (if/else-if semantics)
};

// V2 Filter Plugins AST (Filter Simulator)
export type PluginConfig = {
  name: string; // e.g., "json", "split", "mutate"
  fields: Record<string, any>; // Generic config payload
};

export type Stage = {
  condition: Condition | null; // null = always run (like top-level mutate)
  pluginName: string;
  pluginConfig: PluginConfig;
  sourceLine: number;
};

export type ParsedFilterPipeline = {
  stages: Stage[]; // Executed ALL in sequence
};

export type Token = {
  type: "Keyword" | "Identifier" | "String" | "Regex" | "Operator" | "Punctuation" | "EOF";
  value: string;
  line: number;
  column: number;
};
