const tsNode = require('ts-node');
tsNode.register({ compilerOptions: { module: 'commonjs' } });
const { parseLogstash } = require('./lib/parser');
const { Evaluator } = require('./lib/evaluator/engine');

const config = `filter {
  if [data][win][eventdata][subjectUserName] =~ /\\$$/ or [source_username] =~ /\\$$/ or [target_username] =~ /\\$$/ and ![field][log_category] {
    mutate {
      add_field => { "[whitelist]" => "true" }
    }
  }
}`;

const log = { data: { win: { eventdata: { subjectUserName: 'W006028$' } } } };

try {
  const pipeline = parseLogstash(config);
  const eval = new Evaluator(log);
  const result = eval.evaluate(pipeline);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
