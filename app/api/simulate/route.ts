import { NextResponse } from "next/server";
import { tokenize } from "../../../lib/parser/tokenizer";
import {
  LogstashParser,
  ParseError,
} from "../../../lib/parser/logstash-parser";
import { Evaluator } from "../../../lib/evaluator/engine";
import { LogEvent } from "../../../lib/evaluator/helpers";
import { evaluate_vrl } from "../../../lib/vrl-wasm-pkg/vrl_wasm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      engine,
      rawlog,
      pipelineConfig,
      rootPath,
      practicalMode = true,
    } = body;

    if (!rawlog || !pipelineConfig) {
      return NextResponse.json(
        { error: "Missing rawlog or pipelineConfig" },
        { status: 400 },
      );
    }

    const parsedRawlog =
      typeof rawlog === "string" ? JSON.parse(rawlog) : rawlog;

    if (engine === "vector") {
      try {
        const payloadStr = JSON.stringify(parsedRawlog);
        // evaluate_vrl is synchronous and returns VrlResult
        const vrlResult = evaluate_vrl(pipelineConfig, payloadStr);

        if (!vrlResult.success) {
          return NextResponse.json(
            {
              error: "VrlParseError",
              message: vrlResult.output, // The exact rust error [E110] etc
            },
            { status: 400 },
          );
        }

        const outBody = JSON.parse(vrlResult.output);

        const rawWhitelisted = outBody?.whitelisted ?? outBody?._source?.whitelisted;

        const isWhitelisted =
          rawWhitelisted === true ||
          rawWhitelisted === "true" ||
          String(rawWhitelisted).toLowerCase() === "true";

        return NextResponse.json({
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
        });
      } catch (e: any) {
        return NextResponse.json(
          {
            error: "WasmExecutionError",
            message: e.message || String(e),
          },
          { status: 500 },
        );
      }
    } else {
      // Default: logstash
      try {
        const tokens = tokenize(pipelineConfig);
        const parser = new LogstashParser(tokens);
        const pipeline = parser.parse();

        const evaluator = new Evaluator(parsedRawlog, rootPath);
        const result = evaluator.simulate(pipeline);

        return NextResponse.json(result);
      } catch (e: any) {
        if (e instanceof ParseError) {
          return NextResponse.json(
            {
              error: "ParseError",
              message: e.message,
              line: e.line,
              column: e.column,
            },
            { status: 400 },
          );
        } else {
          throw e;
        }
      }
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 },
    );
  }
}
