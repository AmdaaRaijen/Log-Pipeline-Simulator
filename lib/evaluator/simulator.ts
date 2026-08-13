import { tokenize } from "../parser/tokenizer";
import { LogstashParser, ParseError } from "../parser/logstash-parser";
import { Evaluator } from "./engine";
import { evaluate_vrl } from "../vrl-wasm-pkg/vrl_wasm";

export type RunSimulationResult =
  | {
      success: true;
      matched: boolean;
      evaluationTrace: any[];
      resultEvent: any;
      matchedRule: any | null;
      warnings?: string[];
      pipelineAST?: any; // To pass back for linting if needed
    }
  | {
      success: false;
      error: string;
      message: string;
      line?: number;
      column?: number;
    };

export function runSimulation(
  engine: "logstash" | "vector",
  pipelineConfig: string,
  parsedRawlog: any,
  rootPath?: string
): RunSimulationResult {
  if (engine === "vector") {
    try {
      const eventToEvaluate = parsedRawlog._source
        ? parsedRawlog._source
        : parsedRawlog;
      const payloadStr = JSON.stringify(eventToEvaluate);

      const vrlResult = evaluate_vrl(pipelineConfig, payloadStr);

      if (!vrlResult.success) {
        return {
          success: false,
          error: "VrlParseError",
          message: vrlResult.output,
        };
      }

      const outBody = JSON.parse(vrlResult.output);
      const rawWhitelisted =
        outBody?.whitelisted ?? outBody?._source?.whitelisted;
      const rawWhitelistID =
        outBody?.whitelistID ?? outBody?._source?.whitelistID ?? outBody?.whitelistId ?? outBody?._source?.whitelistId;
      const logCategory = 
        outBody?.field?.log_category ?? outBody?._source?.field?.log_category ?? outBody?.["@metadata"]?.log_category ?? outBody?._source?.["@metadata"]?.log_category;

      const isWhitelisted =
        rawWhitelisted === true ||
        rawWhitelisted === "true" ||
        String(rawWhitelisted).toLowerCase() === "true" ||
        (rawWhitelistID !== undefined && rawWhitelistID !== null) ||
        logCategory === "activity";

      return {
        success: true,
        matched: isWhitelisted,
        evaluationTrace: [
          {
            matched: true,
            branchIndex: "Native Vector",
            reason: "Successfully evaluated via Vector Rust WASM",
          },
        ],
        resultEvent: outBody,
        matchedRule: null,
      };
    } catch (e: any) {
      return {
        success: false,
        error: "WasmExecutionError",
        message: e.message || String(e),
      };
    }
  } else {
    // Logstash
    try {
      const tokens = tokenize(pipelineConfig);
      const parser = new LogstashParser(tokens);
      const pipeline = parser.parse();

      const evaluator = new Evaluator(parsedRawlog, rootPath);
      const result = evaluator.simulate(pipeline);

      // Check whitelisted from root or _source
      let finalWhitelisted = false;
      const _source = result.resultEvent?._source;
      const val = result.resultEvent?.whitelisted ?? _source?.whitelisted;
      const wId = result.resultEvent?.whitelistID ?? _source?.whitelistID ?? result.resultEvent?.whitelistId ?? _source?.whitelistId;
      const logCategory = result.resultEvent?.field?.log_category ?? _source?.field?.log_category ?? result.resultEvent?.["@metadata"]?.log_category ?? _source?.["@metadata"]?.log_category;
      
      finalWhitelisted = val === true || val === "true" || String(val).toLowerCase() === "true" || (wId !== undefined && wId !== null) || logCategory === "activity";
      // We will override result.matched if necessary, but Logstash sets it via `add_field` logic.
      // Usually `simulate` sets `matched` to true if any branch matches. 
      // We will rely on `result.matched` from the simulator engine for consistency, but ensure it aligns with `whitelisted`.

      return {
        success: true,
        matched: finalWhitelisted, // Ensure `matched` strictly respects `whitelisted` field
        evaluationTrace: result.evaluationTrace,
        resultEvent: result.resultEvent,
        matchedRule: result.matchedRule,
        warnings: result.warnings,
        pipelineAST: pipeline,
      };
    } catch (e: any) {
      if (e instanceof ParseError) {
        return {
          success: false,
          error: "ParseError",
          message: e.message,
          line: e.line,
          column: e.column,
        };
      } else {
        return {
          success: false,
          error: "EvaluationError",
          message: e.message || String(e),
        };
      }
    }
  }
}
