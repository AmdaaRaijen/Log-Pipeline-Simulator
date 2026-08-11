import { ParsedPipeline, Rule, Condition, FieldPath, MutateAction } from "../parser";

export type TraceEntry = {
  branchIndex: number;
  matched: boolean;
  reason: string;
};

export type SimulationResult = {
  matched: boolean;
  matchedRule: { branchIndex: number; sourceLine: number } | null;
  evaluationTrace: TraceEntry[];
  resultEvent: any;
};

export class Evaluator {
  private event: any;
  private trace: TraceEntry[] = [];

  constructor(event: any, private rootPath?: string) {
    if (rootPath && event[rootPath]) {
      this.event = JSON.parse(JSON.stringify(event[rootPath]));
    } else if (event._source) {
      this.event = JSON.parse(JSON.stringify(event._source));
    } else {
      this.event = JSON.parse(JSON.stringify(event));
    }
  }

  private getFieldValue(path: FieldPath): any {
    let current = this.event;
    for (const key of path) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  private setFieldValue(path: string, value: any) {
    if (path.startsWith("[") && path.endsWith("]")) {
      const keys = path.split(/\]\[|\[|\]/).filter(Boolean);
      let current = this.event;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    } else {
      this.event[path] = value;
    }
  }

  private evaluateCondition(condition: Condition): { result: boolean; reason: string } {
    switch (condition.type) {
      case "equals": {
        const val = this.getFieldValue(condition.field);
        const eq = val == condition.value;
        const result = condition.negate ? !eq : eq;
        const opStr = condition.negate ? "!=" : "==";
        return { 
          result, 
          reason: `[${condition.field.join("][")}] ${opStr} '${condition.value}' (actual: ${JSON.stringify(val)})` 
        };
      }
      case "regexMatch": {
        const val = this.getFieldValue(condition.field);
        if (typeof val !== "string") {
          return { result: condition.negate, reason: `[${condition.field.join("][")}] not a string` };
        }
        let regex: RegExp;
        try {
          regex = new RegExp(condition.pattern, condition.flags);
        } catch (e) {
          return { result: false, reason: `Invalid regex: ${condition.pattern}` };
        }
        const match = regex.test(val);
        const result = condition.negate ? !match : match;
        const opStr = condition.negate ? "!~" : "=~";
        return {
          result,
          reason: `[${condition.field.join("][")}] ${opStr} /${condition.pattern}/${condition.flags} (actual: '${val}')`
        };
      }
      case "in": {
        const val = this.getFieldValue(condition.field);
        const incl = condition.values.includes(val);
        const result = condition.negate ? !incl : incl;
        const opStr = condition.negate ? "not in" : "in";
        return {
          result,
          reason: `[${condition.field.join("][")}] ${opStr} [${condition.values.join(", ")}] (actual: ${JSON.stringify(val)})`
        };
      }
      case "and": {
        const left = this.evaluateCondition(condition.left);
        if (!left.result) return { result: false, reason: left.reason };
        const right = this.evaluateCondition(condition.right);
        return {
          result: right.result,
          reason: `${left.reason} AND ${right.reason}`
        };
      }
      case "or": {
        const left = this.evaluateCondition(condition.left);
        if (left.result) return { result: true, reason: left.reason };
        const right = this.evaluateCondition(condition.right);
        return {
          result: right.result,
          reason: `(${left.reason}) OR (${right.reason})`
        };
      }
      case "not": {
        const inner = this.evaluateCondition(condition.inner);
        return {
          result: !inner.result,
          reason: `NOT (${inner.reason})`
        };
      }
      case "truthy": {
        const val = this.getFieldValue(condition.field);
        const isTruthy = val !== undefined && val !== null && val !== false && val !== "";
        const result = condition.negate ? !isTruthy : isTruthy;
        const opStr = condition.negate ? "!" : "";
        return {
          result,
          reason: `${opStr}[${condition.field.join("][")}] (actual: ${JSON.stringify(val)})`
        };
      }
      case "inFieldRef": {
        const rightVal = this.getFieldValue(condition.rightField);
        let leftVal = typeof condition.leftField === "string" ? condition.leftField : this.getFieldValue(condition.leftField);
        
        let incl = false;
        if (Array.isArray(rightVal)) {
          incl = rightVal.includes(leftVal);
        } else if (typeof rightVal === "string") {
          incl = rightVal.includes(String(leftVal));
        }
        
        const result = condition.negate ? !incl : incl;
        const opStr = condition.negate ? "not in" : "in";
        return {
          result,
          reason: `${JSON.stringify(leftVal)} ${opStr} [${condition.rightField.join("][")}] (actual: ${JSON.stringify(rightVal)})`
        };
      }
      default:
        throw new Error(`Unsupported condition type in V1 Engine: ${(condition as any).type}`);
    }
  }

  public simulate(pipeline: ParsedPipeline): SimulationResult {
    let matchedRule: Rule | null = null;
    let matched = false;

    for (const rule of pipeline.filters) {
      if (rule.condition === null) {
        this.trace.push({
          branchIndex: rule.branchIndex,
          matched: true,
          reason: "Else branch (no condition)"
        });
        matchedRule = rule;
        matched = true;
        break;
      }

      const { result, reason } = this.evaluateCondition(rule.condition);
      this.trace.push({
        branchIndex: rule.branchIndex,
        matched: result,
        reason
      });

      if (result) {
        matchedRule = rule;
        matched = true;
        break;
      }
    }

    if (matchedRule) {
      for (const action of matchedRule.actions) {
        if (action.type === "addField") {
          for (const [k, v] of Object.entries(action.fields)) {
            this.setFieldValue(k, v);
          }
        }
      }
    }

    return {
      matched,
      matchedRule: matchedRule ? { branchIndex: matchedRule.branchIndex, sourceLine: matchedRule.sourceLine } : null,
      evaluationTrace: this.trace,
      resultEvent: this.event
    };
  }
}
