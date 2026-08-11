import { describe, it, expect } from "vitest";
import { parseVrlScript } from "../lib/vrl/parser";
import { VrlEngine } from "../lib/vrl/engine";
import { LogEvent } from "../lib/evaluator/helpers";
import { tokenize } from "../lib/vrl/tokenizer";

describe("VRL Engine Simulation", () => {
  it("Reproduces tokenizer error", () => {
    const config = `
# Whitelist 1
if includes(["ATT&CK T1035: Service Execution", "ATT&CK T1087 T1082: Reconnaissance Activity with Net Command", "ATT&CK T1489: Stop Windows Service"], .rule.description) && match(to_string!(.data.win.eventdata.currentDirectory), r'Websense') && !exists(.whitelisted) {
  .whitelisted = "true"
  .whitelistID = "1"
}
    `;
    const tokens = tokenize(config);
    console.log(tokens);
  });

  it("Golden Case 1: Event matches Rule 3", () => {
    const config = `
# Whitelist 1
if !exists(.whitelisted) && (.last_action == "DELETE_SUCCESS" || .last_action == "QUARANTINE_SUCCESS") {
    .whitelisted = "true"
    .whitelistID = "1"
}

# Whitelist 2
# if !exists(.whitelisted) && (.description == "Script contains suspicious features.") {
#     .whitelisted = "true"
#     .whitelistID = "disabled"
# }

# Whitelist 3
if !exists(.whitelisted) && (.description == "Script contains suspicious features.") && contains(to_string!(.path), "CL_Utility.ps1") {
    .whitelisted = "true"
    .whitelistID = "2"
}

# Whitelist 4
if !exists(.whitelisted) && match(to_string!(.process_chain[1].command), r'(?i)CompatTelRunner\\.exe...') {
    .whitelisted = "true"
    .whitelistID = "3"
}
    `;

    const pipeline = parseVrlScript(config);
    const engine = new VrlEngine(pipeline, true); // practical mode
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: {
         last_action: "SOMETHING_ELSE",
         description: "Script contains suspicious features.",
         path: "C:\\\\Scripts\\\\CL_Utility.ps1",
         process_chain: [
           { command: "powershell.exe -Command ... HKLM:\\\\SOFTWARE\\\\Microsoft\\\\CTF\\\\TIP ..." },
           { command: "CompatTelRunner.exe -m:appraiser.dll" }
         ]
      }
    };

    const result = engine.run(initialEvent);

    console.log("TRACE:", JSON.stringify(result.trace, null, 2));

    expect(result.finalEvent.body.whitelisted).toBe("true");
    expect(result.finalEvent.body.whitelistID).toBe("2");
    
    // Trace should show:
    // Rule 1: Skipped/Not matched (last_action doesn't match)
    // Rule 2: Disabled
    // Rule 3: Matched!
    // Rule 4: Skipped/Not matched (!exists(.whitelisted) is false now!)
    
    const rule1Trace = result.trace.find(t => t.sourceLine === 3);
    expect(rule1Trace?.matched).toBe(false);

    const disabledTrace = result.trace.find(t => t.skipped);
    expect(disabledTrace).toBeDefined();

    const rule3Trace = result.trace.find(t => t.sourceLine === 15);
    expect(rule3Trace?.matched).toBe(true);

    const rule4Trace = result.trace.find(t => t.sourceLine === 21);
    expect(rule4Trace?.matched).toBe(false);
  });

  it("Golden Case 2: Short-circuiting - Rule 1 matches, preventing Rule 3/4 even if true", () => {
    const config = `
if !exists(.whitelisted) && .last_action == "DELETE_SUCCESS" {
    .whitelisted = "true"
    .whitelistID = "1"
}
if !exists(.whitelisted) && .description == "sus" {
    .whitelisted = "true"
    .whitelistID = "2"
}
    `;
    const pipeline = parseVrlScript(config);
    const engine = new VrlEngine(pipeline);
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: {
         last_action: "DELETE_SUCCESS",
         description: "sus"
      }
    };

    const result = engine.run(initialEvent);
    expect(result.finalEvent.body.whitelisted).toBe("true");
    expect(result.finalEvent.body.whitelistID).toBe("1");
    // Second rule should be evaluated as false due to mutable state
    expect(result.trace[1].matched).toBe(false); 
  });
  
  it("Faithful Mode: Aborts if field is missing", () => {
    const config = `
if contains(to_string!(.missing), "foo") {
    .hit = "true"
}
if .other == "bar" {
    .hit2 = "true"
}
    `;
    const pipeline = parseVrlScript(config);
    const engine = new VrlEngine(pipeline, false); // faithful mode
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { other: "bar" }
    };

    const result = engine.run(initialEvent);
    expect(result.finalEvent.body.hit).toBeUndefined();
    expect(result.finalEvent.body.hit2).toBeUndefined(); // Should abort before evaluating this
    
    const abortTrace = result.trace.find(t => t.error?.includes("Aborted"));
    expect(abortTrace).toBeDefined();
  });
  
  it("Practical Mode: Skips rule if field is missing but continues", () => {
    const config = `
if contains(to_string!(.missing), "foo") {
    .hit = "true"
}
if .other == "bar" {
    .hit2 = "true"
}
    `;
    const pipeline = parseVrlScript(config);
    const engine = new VrlEngine(pipeline, true); // practical mode
    
    const initialEvent: LogEvent = {
      __id: "1",
      metadata: {},
      body: { other: "bar" }
    };

    const result = engine.run(initialEvent);
    expect(result.finalEvent.body.hit).toBeUndefined(); // skipped
    expect(result.finalEvent.body.hit2).toBe("true"); // continued
  });
});
