import { NextResponse } from "next/server";
import { tokenize } from "../../../lib/parser/tokenizer";
import {
  LogstashParser,
  ParseError,
} from "../../../lib/parser/logstash-parser";
import { Evaluator } from "../../../lib/evaluator/engine";
import {
  parseVrlScript,
  ParseError as VrlParseError,
} from "../../../lib/vrl/parser";
import { VrlEngine } from "../../../lib/vrl/engine";
import { LogEvent } from "../../../lib/evaluator/helpers";

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
        const pipeline = parseVrlScript(pipelineConfig);
        const initialEvent: LogEvent = {
          __id: "1",
          metadata: {},
          body: parsedRawlog,
        };

        const vrlEngine = new VrlEngine(pipeline, practicalMode);
        const result = vrlEngine.run(initialEvent);

        const matchedRuleTrace = result.trace.find((t) => t.matched);
        const isWhitelisted =
          ((result.finalEvent.body as any)._source?.whitelisted === "true" ||
            (result.finalEvent.body as any)._source?.whitelisted === true);

        return NextResponse.json({
          matched: isWhitelisted,
          evaluationTrace: result.trace.map((t) => ({
            matched: t.matched,
            branchIndex: `Line ${t.sourceLine}${t.skipped ? " (DISABLED)" : ""}`,
            reason: t.error
              ? `Error: ${t.error}`
              : t.skipped
                ? t.evalDetail
                : t.evalDetail,
          })),
          resultEvent: result.finalEvent.body,
          matchedRule: matchedRuleTrace
            ? {
                branchIndex: `Line ${matchedRuleTrace.sourceLine}`,
                sourceLine: matchedRuleTrace.sourceLine,
              }
            : null,
        });
      } catch (e: any) {
        if (e instanceof VrlParseError) {
          return NextResponse.json(
            {
              error: "VrlParseError",
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
