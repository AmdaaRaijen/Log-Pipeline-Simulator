import { describe, it, expect } from "vitest";
import { tokenize } from "../lib/parser/tokenizer";
import { LogstashParser } from "../lib/parser/logstash-parser";
import { Evaluator } from "../lib/evaluator/engine";

describe("Logstash Engine Simulation", () => {
  it("should evaluate golden test case 1 (not matched due to regex)", () => {
    const config = `
      filter {
        if [indicators][value] =~ /\\/opt\\/metasploit-framework\\/data\\// {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "1" } }
        } else if [model] == "Network Sniffing" {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "3" } }
        } else if [model] == "Scanned Malware Detection" and [indicators][value] =~ /(?i)^C:\\\\Program Files \\(x86\\)\\\\nxlog\\\\/ {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "6" } }
        }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parse();

    const rawlog = {
      _source: {
        model: "Scanned Malware Detection",
        indicators: { value: "PAK_Generic.001" }
      }
    };

    const evaluator = new Evaluator(rawlog, "_source");
    const result = evaluator.simulate(pipeline);

    expect(result.matched).toBe(false);
    expect(result.matchedRule).toBeNull();
    // Branch 0 should fail regex
    // Branch 1 should fail equality
    // Branch 2 should fail regex (second condition in AND)
    expect(result.evaluationTrace.length).toBe(3);
    expect(result.evaluationTrace[2].matched).toBe(false);
    
    // Result event should be unchanged from _source
    expect(result.resultEvent).toEqual(rawlog._source);
  });
  
  it("should match branch 2 when regex passes", () => {
     const config = `
      filter {
        if [indicators][value] =~ /\\/opt\\/metasploit-framework\\/data\\// {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "1" } }
        } else if [model] == "Network Sniffing" {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "3" } }
        } else if [model] == "Scanned Malware Detection" and [indicators][value] =~ /(?i)^C:\\\\Program Files \\(x86\\)\\\\nxlog\\\\/ {
          mutate { add_field => { "whitelisted" => "true", "whitelistId" => "6" } }
        }
      }
    `;

    const tokens = tokenize(config);
    const parser = new LogstashParser(tokens);
    const pipeline = parser.parse();

    const rawlog = {
      _source: {
        model: "Scanned Malware Detection",
        indicators: { value: "c:\\program files (x86)\\nxlog\\test.exe" }
      }
    };

    const evaluator = new Evaluator(rawlog); // auto-detect _source
    const result = evaluator.simulate(pipeline);

    expect(result.matched).toBe(true);
    expect(result.matchedRule?.branchIndex).toBe(2);
    expect(result.resultEvent.whitelisted).toBe("true");
    expect(result.resultEvent.whitelistId).toBe("6");
  });
});
