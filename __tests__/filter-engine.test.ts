import { describe, it, expect } from "vitest";
import { tokenize } from "../lib/parser/tokenizer";
import { LogstashParser } from "../lib/parser/logstash-parser";
import { FilterEngine } from "../lib/evaluator/filter-engine";
import { LogEvent, isLogstashTruthy } from "../lib/evaluator/helpers";

describe("Helpers", () => {
  it("should evaluate isLogstashTruthy correctly", () => {
    expect(isLogstashTruthy(undefined)).toBe(false);
    expect(isLogstashTruthy(null)).toBe(false);
    expect(isLogstashTruthy("")).toBe(false);
    expect(isLogstashTruthy([])).toBe(false);
    
    expect(isLogstashTruthy(0)).toBe(true);
    expect(isLogstashTruthy(false)).toBe(true);
    expect(isLogstashTruthy({})).toBe(true);
    expect(isLogstashTruthy("a")).toBe(true);
    expect(isLogstashTruthy([1])).toBe(true);
  });
});

describe("Filter Engine Simulation", () => {
  it("should split arrays correctly", () => {
    const config = `
      filter {
        split { field => "[indicators]" }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();

    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { indicators: [1, 2, 3], other: "keep" }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);

    expect(result.finalEvents.length).toBe(3);
    expect(result.finalEvents[0].body.indicators).toBe(1);
    expect(result.finalEvents[0].body.other).toBe("keep");
    expect(result.finalEvents[0].__parentId).toBe("1");
    
    expect(result.finalEvents[2].body.indicators).toBe(3);
  });
  
  it("should warn and not split if array is empty", () => {
    const config = `
      filter {
        split { field => "[indicators]" }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();

    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { indicators: [], other: "keep" }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);

    expect(result.finalEvents.length).toBe(0); // dropped
    expect(result.trace[0].dropped).toBe(true);
    expect(result.trace[0].warnings?.[0]).toContain("is empty. Event dropped.");
  });

  it("should warn and not split if field is not array", () => {
    const config = `
      filter {
        split { field => "[indicators]" }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();

    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { indicators: { obj: true }, other: "keep" }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);

    expect(result.finalEvents.length).toBe(1);
    expect(result.trace[0].warnings?.[0]).toContain("is not an array");
  });

  it("should resolve sprintf in mutate correctly", () => {
    const config = `
      filter {
        mutate {
          add_field => {
            "resolved" => "%{[matchedRules][name]}"
            "missing" => "%{[missingField]}"
          }
        }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();

    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { matchedRules: { name: "MalwareRule" } }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);

    expect(result.finalEvents[0].body.resolved).toBe("MalwareRule");
    expect(result.finalEvents[0].body.missing).toBe("%{[missingField]}");
  });
  
  it("should remove_field including nested path", () => {
     const config = `
      filter {
        mutate {
          remove_field => ["a", "[event][Data]"]
        }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();

    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { a: 1, keep: 2, event: { Data: "del", other: "keep2" } }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);

    expect(result.finalEvents[0].body.a).toBeUndefined();
    expect(result.finalEvents[0].body.keep).toBe(2);
    expect((result.finalEvents[0].body.event as any).Data).toBeUndefined();
    expect((result.finalEvents[0].body.event as any).other).toBe("keep2");
  });
  
  it("should handle inFieldRef condition", () => {
    const config = `
      filter {
        if "_jsonparsefailure" in [tags] {
          mutate { add_field => { "failed" => "yes" } }
        }
      }
    `;
    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { tags: ["_jsonparsefailure", "other"] }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);
    expect(result.finalEvents[0].body.failed).toBe("yes");
  });

  it("should end-to-end split logic", () => {
    const config = `
      filter {
        if [impactScope][entities] {
          split { field => "[impactScope][entities]" }
        }
        if [indicators] {
          split { field => "[indicators]" }
          mutate {
            add_field => { "indicator_value" => "%{[indicators][value]}" }
          }
        }
      }
    `;
    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parseSequential();
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { 
        impactScope: { entities: [{e: 1}, {e: 2}] },
        indicators: [{value: "A"}, {value: "B"}]
      }
    };

    const engine = new FilterEngine(pipeline);
    const result = engine.run(initialEvent);
    
    // 2 entities * 2 indicators = 4 events
    expect(result.finalEvents.length).toBe(4);
    expect(result.finalEvents[0].body.indicator_value).toBe("A");
    expect(result.finalEvents[1].body.indicator_value).toBe("B");
    expect(result.finalEvents[2].body.indicator_value).toBe("A");
    expect(result.finalEvents[3].body.indicator_value).toBe("B");
  });
});
