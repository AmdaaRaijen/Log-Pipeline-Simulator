import { ParsedVrlPipeline, VrlStage, Condition, Expr } from "./types";
import { LogEvent, getNestedValue, setNestedValue } from "../evaluator/helpers";

export type VrlTraceEntry = {
  sourceLine: number;
  matched: boolean;
  skipped?: boolean;
  evalDetail?: string;
  error?: string;
};

type VrlFunctionImpl = (args: unknown[], event: LogEvent) => { value: unknown; error?: string };

const VRL_FUNCTIONS: Record<string, VrlFunctionImpl> = {
  exists: (args) => {
    const val = args[0];
    return { value: val !== undefined && val !== null };
  },
  contains: (args) => {
    const [str, substr] = args;
    if (typeof str !== "string") return { value: false, error: "First arg to contains is not a string" };
    return { value: str.includes(String(substr)) };
  },
  includes: (args) => {
    const [arr, item] = args;
    if (!Array.isArray(arr)) return { value: false, error: "First arg to includes is not an array" };
    return { value: arr.includes(item) };
  },
  match: (args) => {
    const [str, regex] = args;
    if (typeof str !== "string") return { value: false, error: "First arg to match is not a string" };
    if (!(regex instanceof RegExp)) return { value: false, error: "Second arg to match is not a regex" };
    return { value: regex.test(str) };
  },
  to_string: (args) => {
    if (args[0] === undefined || args[0] === null) {
      return { value: undefined, error: "Field is null or missing" };
    }
    return { value: String(args[0]) };
  }
};

export class VrlEngine {
  constructor(private pipeline: ParsedVrlPipeline, private practicalMode: boolean = true) {}

  private resolveExpr(expr: Expr, event: LogEvent): { value: unknown; error?: string; fallible?: boolean } {
    switch (expr.type) {
      case "arrayLiteral":
        const elements = [];
        for (const el of expr.elements) {
          const res = this.resolveExpr(el, event);
          if (res.error) return res;
          elements.push(res.value);
        }
        return { value: elements };
      case "stringLiteral":
        return { value: expr.value };
      case "regexLiteral":
        try {
          return { value: new RegExp(expr.pattern, expr.flags) };
        } catch (e: any) {
          return { value: null, error: `Invalid regex: ${e.message}` };
        }
      case "fieldRef":
        return { value: getNestedValue(event.body, expr.path) };
      case "functionCall":
        const fn = VRL_FUNCTIONS[expr.name];
        if (!fn) {
           return { value: null, error: `Function ${expr.name} not implemented` };
        }
        
        const evalArgs = [];
        for (const argExpr of expr.args) {
           const res = this.resolveExpr(argExpr, event);
           if (res.error) {
              return res; // Bubble up error
           }
           evalArgs.push(res.value);
        }
        
        const result = fn(evalArgs, event);
        if (result.error) {
           return { ...result, fallible: expr.fallible };
        }
        return result;
    }
  }

  private evaluateCondition(condition: Condition, event: LogEvent): { result: boolean; reason: string; abort?: boolean } {
    switch (condition.type) {
      case "equals": {
        const left = this.resolveExpr(condition.left, event);
        if (left.error) {
           if (!this.practicalMode && left.fallible !== false) return { result: false, reason: left.error, abort: true };
           return { result: false, reason: left.error };
        }
        
        const right = this.resolveExpr(condition.right, event);
        if (right.error) {
           if (!this.practicalMode && right.fallible !== false) return { result: false, reason: right.error, abort: true };
           return { result: false, reason: right.error };
        }
        
        const eq = left.value === right.value;
        const result = condition.negate ? !eq : eq;
        const opStr = condition.negate ? "!=" : "==";
        return { result, reason: `${JSON.stringify(left.value)} ${opStr} ${JSON.stringify(right.value)}` };
      }
      case "functionCall": {
        const fn = VRL_FUNCTIONS[condition.name];
        if (!fn) {
           return { result: false, reason: `Function ${condition.name} not implemented` };
        }
        const evalArgs = [];
        for (const argExpr of condition.args) {
           const res = this.resolveExpr(argExpr, event);
           if (res.error) {
              if (!this.practicalMode && res.fallible !== false) return { result: false, reason: res.error, abort: true };
              return { result: false, reason: res.error };
           }
           evalArgs.push(res.value);
        }
        const res = fn(evalArgs, event);
        if (res.error) {
           if (!this.practicalMode && condition.fallible) return { result: false, reason: res.error, abort: true };
           return { result: false, reason: `${condition.name} failed: ${res.error}` }; // practical mode skips (false)
        }
        
        const truthy = Boolean(res.value);
        const result = condition.negate ? !truthy : truthy;
        return { result, reason: `${condition.negate ? '!' : ''}${condition.name}(...) -> ${truthy}` };
      }
      case "and": {
        const left = this.evaluateCondition(condition.left, event);
        if (left.abort) return left;
        if (!left.result) return left; // short-circuit
        const right = this.evaluateCondition(condition.right, event);
        if (right.abort) return right;
        return { result: right.result, reason: `${left.reason} AND ${right.reason}` };
      }
      case "or": {
        const left = this.evaluateCondition(condition.left, event);
        if (left.abort) return left;
        if (left.result) return left; // short-circuit
        const right = this.evaluateCondition(condition.right, event);
        if (right.abort) return right;
        return { result: right.result, reason: `(${left.reason}) OR (${right.reason})` };
      }
      case "not": {
        const inner = this.evaluateCondition(condition.inner, event);
        if (inner.abort) return inner;
        return { result: !inner.result, reason: `NOT (${inner.reason})` };
      }
    }
  }

  public run(initialEvent: LogEvent): { finalEvent: LogEvent, trace: VrlTraceEntry[] } {
    const event = JSON.parse(JSON.stringify(initialEvent)); // mutable deep copy
    const trace: VrlTraceEntry[] = [];

    // Sort stages: disabled blocks go to bottom or keep their line order.
    // They don't have sourceLine if they were parsed from end of file, but we'll try to maintain order if we gave them lines.
    // For now, they are just added at the end of the pipeline.stages array in the parser.
    const sortedStages = [...this.pipeline.stages].sort((a, b) => a.sourceLine - b.sourceLine);

    for (const stage of sortedStages) {
      if (stage.disabled) {
        trace.push({
          sourceLine: stage.sourceLine || 0,
          matched: false,
          skipped: true,
          evalDetail: "Rule di-comment-out di source config",
        });
        continue;
      }

      if (!stage.condition) {
         continue; 
      }

      const evalRes = this.evaluateCondition(stage.condition, event);

      if (evalRes.abort) {
         trace.push({
            sourceLine: stage.sourceLine,
            matched: false,
            error: `❌ Aborted at line ${stage.sourceLine} — remaining rules tidak dievaluasi. Error: ${evalRes.reason}`
         });
         break; // Faithful mode aborts entirely
      }

      trace.push({
        sourceLine: stage.sourceLine,
        matched: evalRes.result,
        evalDetail: evalRes.reason
      });

      if (evalRes.result) {
        for (const a of stage.assignments) {
          const valRes = this.resolveExpr(a.valueExpr, event);
          if (valRes.error && !this.practicalMode) {
             trace.push({
               sourceLine: stage.sourceLine,
               matched: true,
               error: `❌ Aborted during assignment. Error: ${valRes.error}`
             });
             return { finalEvent: event, trace };
          }
          setNestedValue(event.body, a.targetPath, valRes.value);
        }
      }
    }

    return { finalEvent: event, trace };
  }
}
