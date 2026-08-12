import { tokenize } from './lib/parser/tokenizer';
import { LogstashParser } from './lib/parser/logstash-parser';
import { Evaluator } from './lib/evaluator/engine';

const config = `filter {
  if [data][win][eventdata][subjectUserName] =~ /\\$$/ {
    mutate {
      add_field => { "[whitelist]" => "true" }
    }
  }

  if [data][win][eventdata][subjectUserName] == "W006028$" {
    mutate {
      add_field => { "[whitelist]" => "true" }
    }
  }
}`;

const log = { data: { win: { eventdata: { subjectUserName: 'W006028$' } } } };

try {
  const tokens = tokenize(config);
  const parser = new LogstashParser(tokens);
  const pipeline = parser.parse();
  const evalEngine = new Evaluator(log);
  const result = evalEngine.simulate(pipeline);
  console.log(JSON.stringify(result, null, 2));
} catch (e: any) {
  console.error('Error:', e.message);
}
