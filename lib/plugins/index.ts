import { PluginConfig } from "../parser";
import { LogEvent, getNestedValue, setNestedValue, removeNestedValue, resolveSprintf } from "../evaluator/helpers";

export interface FilterPlugin {
  type: string;
  apply(events: LogEvent[], config: PluginConfig, ctx: { practicalMode: boolean }): { events: LogEvent[], warnings: string[] };
}

export const JsonPlugin: FilterPlugin = {
  type: "json",
  apply(events, config, ctx) {
    const nextEvents: LogEvent[] = [];
    const warnings: string[] = [];

    const sourceField = config.fields["source"] || "message";
    const targetField = config.fields["target"];

    for (const event of events) {
      const sourcePath = [sourceField]; 
      const sourceVal = getNestedValue(event.body, sourcePath);

      if (sourceVal === undefined || sourceVal === null) {
        if (ctx.practicalMode) {
          // Practical mode: skip and do nothing
          nextEvents.push(event);
        } else {
          // Faithful mode: add _jsonparsefailure
          const newEvent = { ...event, body: JSON.parse(JSON.stringify(event.body)) };
          if (!newEvent.body.tags) newEvent.body.tags = [];
          if (Array.isArray(newEvent.body.tags)) {
             newEvent.body.tags.push("_jsonparsefailure");
          }
          nextEvents.push(newEvent);
        }
        continue;
      }

      if (typeof sourceVal !== 'string') {
        warnings.push(`json filter: field [${sourceField}] is not a string`);
        const newEvent = { ...event, body: JSON.parse(JSON.stringify(event.body)) };
        if (!newEvent.body.tags) newEvent.body.tags = [];
        if (Array.isArray(newEvent.body.tags)) newEvent.body.tags.push("_jsonparsefailure");
        nextEvents.push(newEvent);
        continue;
      }

      try {
        const parsed = JSON.parse(sourceVal);
        const newEvent = { ...event, body: JSON.parse(JSON.stringify(event.body)) };
        
        if (targetField) {
          setNestedValue(newEvent.body, [targetField], parsed);
        } else {
          // Merge to root
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            Object.assign(newEvent.body, parsed);
          }
        }
        nextEvents.push(newEvent);
      } catch (e) {
        const newEvent = { ...event, body: JSON.parse(JSON.stringify(event.body)) };
        if (!newEvent.body.tags) newEvent.body.tags = [];
        if (Array.isArray(newEvent.body.tags)) newEvent.body.tags.push("_jsonparsefailure");
        nextEvents.push(newEvent);
      }
    }
    
    return { events: nextEvents, warnings };
  }
};

export const SplitPlugin: FilterPlugin = {
  type: "split",
  apply(events, config, ctx) {
    const nextEvents: LogEvent[] = [];
    const warnings: string[] = [];

    const fieldRaw = config.fields["field"] || "";
    // e.g. "[indicators]" or "indicators"
    const fieldPath = fieldRaw.split(/\]\[|\[|\]/).filter(Boolean);
    
    if (fieldPath.length === 0) {
      warnings.push("split: target field not specified or invalid");
      return { events, warnings };
    }

    for (const event of events) {
      const arr = getNestedValue(event.body, fieldPath);
      
      if (!Array.isArray(arr)) {
        warnings.push(`split: field [${fieldPath.join("][")}] is not an array. Actual type: ${typeof arr}`);
        nextEvents.push(event); // pass through unmodified
        continue;
      }

      if (arr.length === 0) {
        warnings.push(`split: array [${fieldPath.join("][")}] is empty. Event dropped.`);
        continue; // Drop the event
      }

      for (let i = 0; i < arr.length; i++) {
        const newEvent: LogEvent = {
          __id: crypto.randomUUID(),
          __parentId: event.__id,
          __splitIndex: i,
          metadata: JSON.parse(JSON.stringify(event.metadata)),
          body: JSON.parse(JSON.stringify(event.body))
        };
        
        // Replace the array field with the single element
        setNestedValue(newEvent.body, fieldPath, arr[i]);
        nextEvents.push(newEvent);
      }
    }

    return { events: nextEvents, warnings };
  }
};

export const MutatePlugin: FilterPlugin = {
  type: "mutate",
  apply(events, config, ctx) {
    const nextEvents: LogEvent[] = [];
    const warnings: string[] = [];

    for (const event of events) {
      const newEvent = { ...event, body: JSON.parse(JSON.stringify(event.body)), metadata: JSON.parse(JSON.stringify(event.metadata)) };
      
      // add_field
      if (config.fields["add_field"]) {
        const adds = config.fields["add_field"];
        for (const [k, v] of Object.entries(adds)) {
          const path = k.split(/\]\[|\[|\]/).filter(Boolean);
          const resolvedValue = resolveSprintf(v as string, newEvent);
          
          if (k.startsWith("[@metadata]")) {
             // It's a metadata field
             const metaPath = path.slice(1);
             setNestedValue(newEvent.metadata, metaPath, resolvedValue);
          } else {
             setNestedValue(newEvent.body, path, resolvedValue);
          }
        }
      }

      // remove_field
      if (config.fields["remove_field"]) {
        const removes = config.fields["remove_field"] as string[];
        for (const k of removes) {
          const path = k.split(/\]\[|\[|\]/).filter(Boolean);
          if (k.startsWith("[@metadata]")) {
             const metaPath = path.slice(1);
             removeNestedValue(newEvent.metadata, metaPath);
          } else {
             removeNestedValue(newEvent.body, path);
          }
        }
      }

      nextEvents.push(newEvent);
    }
    return { events: nextEvents, warnings };
  }
};

export const Plugins: Record<string, FilterPlugin> = {
  json: JsonPlugin,
  split: SplitPlugin,
  mutate: MutatePlugin
};
