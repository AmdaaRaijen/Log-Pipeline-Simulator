import { NextResponse } from 'next/server';
import { tokenize } from '../../../lib/parser/tokenizer';
import { LogstashParser, ParseError } from '../../../lib/parser/logstash-parser';
import { FilterEngine } from '../../../lib/evaluator/filter-engine';
import { LogEvent } from '../../../lib/evaluator/helpers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rawlog, pipelineConfig, practicalMode = true } = body;

    if (!rawlog || !pipelineConfig) {
      return NextResponse.json({ error: "Missing rawlog or pipelineConfig" }, { status: 400 });
    }

    try {
      const tokens = tokenize(pipelineConfig);
      const parser = new LogstashParser(tokens);
      const pipeline = parser.parseSequential();

      const parsedRawlog = typeof rawlog === 'string' ? JSON.parse(rawlog) : rawlog;
      
      const initialEvent: LogEvent = {
         __id: "root-1",
         metadata: {},
         body: parsedRawlog
      };

      const engine = new FilterEngine(pipeline, practicalMode);
      const result = engine.run(initialEvent);

      return NextResponse.json({
         trace: result.trace,
         finalEvents: result.finalEvents
      });
    } catch (e: any) {
      if (e instanceof ParseError) {
        return NextResponse.json({
          error: "ParseError",
          message: e.message,
          line: e.line,
          column: e.column
        }, { status: 400 });
      } else {
        throw e;
      }
    }
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
  }
}
