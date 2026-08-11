export type LogEvent = {
  __id: string;
  __parentId?: string;
  __splitIndex?: number;
  metadata: Record<string, unknown>;
  body: Record<string, unknown>;
};

export function getNestedValue(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

export function setNestedValue(obj: any, path: string[], value: any) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

export function removeNestedValue(obj: any, path: string[]) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined || current[key] === null) return;
    current = current[key];
  }
  delete current[path[path.length - 1]];
}

export function isLogstashTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  // 0, false, {}, etc. are truthy because the field exists
  return true;
}

export function parseFieldRef(ref: string): string[] {
  // e.g. "[matchedRules][name]" -> ["matchedRules", "name"]
  // e.g. "matchedRules" -> ["matchedRules"]
  if (ref.startsWith("[")) {
    return ref.split(/\]\[|\[|\]/).filter(Boolean);
  }
  return [ref];
}

export function resolveSprintf(template: string, event: LogEvent): string {
  return template.replace(/%\{(\[[^}]+\]|\w+)\}/g, (match, ref) => {
    const path = parseFieldRef(ref);
    let value: any;
    if (path[0] === "@metadata") {
      value = getNestedValue(event.metadata, path.slice(1));
    } else {
      value = getNestedValue(event.body, path);
    }
    return value !== undefined ? String(value) : match;
  });
}
