import { ParsedFilterPipeline, Stage, Condition } from "../parser";
import { Plugins } from "../plugins";
import { LogEvent, getNestedValue, isLogstashTruthy } from "./helpers";

export type StageTraceEntry = {
  sourceLine: number;
  eventRef: string; // The __id of the event
  conditionMet: boolean;
  plugin: string;
  reason?: string;
  warnings?: string[];
  dropped?: boolean;
};

export class FilterEngine {
  constructor(private pipeline: ParsedFilterPipeline, private practicalMode: boolean = true) {}

  private evaluateCondition(condition: Condition, event: LogEvent): { result: boolean; reason: string } {
    switch (condition.type) {
      case "truthy": {
        let val: any;
        if (condition.field[0] === "@metadata") {
           val = getNestedValue(event.metadata, condition.field.slice(1));
        } else {
           val = getNestedValue(event.body, condition.field);
        }
        const truthy = isLogstashTruthy(val);
        const result = condition.negate ? !truthy : truthy;
        const opStr = condition.negate ? "!truthy" : "truthy";
        return { 
          result, 
          reason: `[${condition.field.join("][")}] is ${opStr} (actual: ${JSON.stringify(val)})` 
        };
      }
      case "inFieldRef": {
        const rightVal = getNestedValue(event.body, condition.rightField);
        let incl = false;
        if (Array.isArray(rightVal)) {
          incl = rightVal.includes(condition.leftField as string);
        } else if (typeof rightVal === 'string') {
          incl = rightVal.includes(condition.leftField as string);
        }
        const result = condition.negate ? !incl : incl;
        const opStr = condition.negate ? "not in" : "in";
        return {
          result,
          reason: `"${condition.leftField}" ${opStr} [${condition.rightField.join("][")}] (actual: ${JSON.stringify(rightVal)})`
        };
      }
      case "equals": {
        const val = getNestedValue(event.body, condition.field);
        const eq = val == condition.value;
        const result = condition.negate ? !eq : eq;
        const opStr = condition.negate ? "!=" : "==";
        return { 
          result, 
          reason: `[${condition.field.join("][")}] ${opStr} '${condition.value}' (actual: ${JSON.stringify(val)})` 
        };
      }
      case "regexMatch": {
        const val = getNestedValue(event.body, condition.field);
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
        const val = getNestedValue(event.body, condition.field);
        const incl = condition.values.includes(val as string);
        const result = condition.negate ? !incl : incl;
        const opStr = condition.negate ? "not in" : "in";
        return {
          result,
          reason: `[${condition.field.join("][")}] ${opStr} [${condition.values.join(", ")}] (actual: ${JSON.stringify(val)})`
        };
      }
      case "and": {
        const left = this.evaluateCondition(condition.left, event);
        if (!left.result) return { result: false, reason: left.reason };
        const right = this.evaluateCondition(condition.right, event);
        return {
          result: right.result,
          reason: `${left.reason} AND ${right.reason}`
        };
      }
      case "or": {
        const left = this.evaluateCondition(condition.left, event);
        if (left.result) return { result: true, reason: left.reason };
        const right = this.evaluateCondition(condition.right, event);
        return {
          result: right.result,
          reason: `(${left.reason}) OR (${right.reason})`
        };
      }
      case "not": {
        const inner = this.evaluateCondition(condition.inner, event);
        return {
          result: !inner.result,
          reason: `NOT (${inner.reason})`
        };
      }
    }
    return { result: false, reason: "unknown condition" };
  }

  public run(initialEvent: LogEvent): { finalEvents: LogEvent[], trace: StageTraceEntry[] } {
    let workingSet: LogEvent[] = [initialEvent];
    const trace: StageTraceEntry[] = [];

    for (const stage of this.pipeline.stages) {
      const nextSet: LogEvent[] = [];
      const plugin = Plugins[stage.pluginName];
      
      if (!plugin) {
         trace.push({
           sourceLine: stage.sourceLine,
           eventRef: "*",
           conditionMet: false,
           plugin: stage.pluginName,
           warnings: [`Unknown plugin: ${stage.pluginName}`]
         });
         // Pass through
         workingSet.forEach(e => nextSet.push(e));
         workingSet = nextSet;
         continue;
      }

      for (const event of workingSet) {
        let conditionMet = true;
        let reason = "No condition (always run)";
        
        if (stage.condition) {
          const evalRes = this.evaluateCondition(stage.condition, event);
          conditionMet = evalRes.result;
          reason = evalRes.reason;
        }

        if (conditionMet) {
          const { events: outEvents, warnings } = plugin.apply([event], stage.pluginConfig, { practicalMode: this.practicalMode });
          trace.push({
            sourceLine: stage.sourceLine,
            eventRef: event.__id,
            conditionMet,
            plugin: stage.pluginName,
            reason,
            warnings,
            dropped: outEvents.length === 0
          });
          nextSet.push(...outEvents);
        } else {
          trace.push({
            sourceLine: stage.sourceLine,
            eventRef: event.__id,
            conditionMet,
            plugin: stage.pluginName,
            reason
          });
          nextSet.push(event);
        }
      }
      workingSet = nextSet;
    }

    return { finalEvents: workingSet, trace };
  }
}
