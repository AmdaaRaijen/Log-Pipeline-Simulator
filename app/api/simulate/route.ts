import { NextResponse } from "next/server";
import { runSimulation } from "../../../lib/evaluator/simulator";

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

    const result = runSimulation(engine as "logstash" | "vector", pipelineConfig, parsedRawlog, rootPath);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
          line: result.line,
          column: result.column,
        },
        { status: result.error === "WasmExecutionError" || result.error === "EvaluationError" ? 500 : 400 },
      );
    }

    return NextResponse.json({
      matched: result.matched,
      evaluationTrace: result.evaluationTrace,
      resultEvent: result.resultEvent,
      matchedRule: result.matchedRule,
      warnings: result.warnings,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "InternalServerError", message: e.message || String(e) },
      { status: 500 },
    );
  }
}
