import { ParsedPipeline, Condition as LSCondition } from "../parser/types";
import { ParsedVrlPipeline, Condition as VRLCondition, Expr as VRLExpr } from "../vrl/types";

export function flattenForPrompt(obj: unknown, prefix: string[] = []): string[] {
  const lines: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => lines.push(...flattenForPrompt(item, [...prefix, String(i)])));
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      lines.push(...flattenForPrompt(value, [...prefix, key]));
    }
  } else {
    lines.push(`${prefix.join(".")} = ${JSON.stringify(obj)}`);
  }
  return lines;
}

export function normalizeSnippetForValidation(snippet: string, engine: "logstash" | "vector"): string {
  if (engine === "logstash") {
    let trimmed = snippet.trim();
    if (trimmed.startsWith("else if")) {
      trimmed = trimmed.replace(/^else\s+if/, "if");
    }
    return `filter {\n${trimmed}\n}`;
  }
  return snippet;
}

function countLsFields(cond: LSCondition): Set<string> {
  const fields = new Set<string>();
  if (cond.type === "and" || cond.type === "or") {
    countLsFields(cond.left).forEach(f => fields.add(f));
    countLsFields(cond.right).forEach(f => fields.add(f));
  } else if (cond.type === "not") {
    countLsFields(cond.inner).forEach(f => fields.add(f));
  } else if ("field" in cond) {
    fields.add(cond.field.join("."));
  } else if (cond.type === "inFieldRef") {
    fields.add(cond.rightField.join("."));
    if (typeof cond.leftField !== "string") {
      fields.add(cond.leftField.join("."));
    }
  }
  return fields;
}

function extractVrlFields(expr: VRLExpr): Set<string> {
  const fields = new Set<string>();
  if (expr.type === "fieldRef") {
    fields.add(expr.path.join("."));
  } else if (expr.type === "functionCall") {
    expr.args.forEach(arg => extractVrlFields(arg).forEach(f => fields.add(f)));
  } else if (expr.type === "arrayLiteral") {
    expr.elements.forEach(el => extractVrlFields(el).forEach(f => fields.add(f)));
  }
  return fields;
}

function countVrlFields(cond: VRLCondition): Set<string> {
  const fields = new Set<string>();
  if (cond.type === "and" || cond.type === "or") {
    countVrlFields(cond.left).forEach(f => fields.add(f));
    countVrlFields(cond.right).forEach(f => fields.add(f));
  } else if (cond.type === "not") {
    countVrlFields(cond.inner).forEach(f => fields.add(f));
  } else if (cond.type === "equals") {
    extractVrlFields(cond.left).forEach(f => fields.add(f));
    extractVrlFields(cond.right).forEach(f => fields.add(f));
  } else if (cond.type === "functionCall") {
    cond.args.forEach(arg => extractVrlFields(arg).forEach(f => fields.add(f)));
  }
  return fields;
}

export function lintForOverBroadRule(
  pipeline: ParsedPipeline | ParsedVrlPipeline,
  engine: "logstash" | "vector"
): string[] {
  const warnings: string[] = [];
  let fieldCount = 0;
  const fields = new Set<string>();

  if (engine === "logstash") {
    const lsPipeline = pipeline as ParsedPipeline;
    const cond = lsPipeline.filters[0]?.condition;
    if (cond) {
      countLsFields(cond).forEach(f => fields.add(f));
    }
  } else {
    const vrlPipeline = pipeline as ParsedVrlPipeline;
    const cond = vrlPipeline.stages[0]?.condition;
    if (cond) {
      countVrlFields(cond).forEach(f => fields.add(f));
    }
  }
  
  // Don't count the whitelisted check itself
  fields.delete("whitelisted");
  
  fieldCount = fields.size;

  if (fieldCount > 0 && fieldCount < 2) {
    warnings.push("⚠️ Rule ini cuma cek 1 field kondisi — pertimbangkan tambah kondisi lain biar lebih spesifik dan gak over-whitelist event lain yang mirip.");
  }

  return warnings;
}
