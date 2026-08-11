import { Token } from "./types";

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current = 0;
  let line = 1;
  let column = 1;

  function advance(steps = 1) {
    for (let i = 0; i < steps; i++) {
      if (input[current] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      current++;
    }
  }

  while (current < input.length) {
    let char = input[current];

    // Skip whitespace
    if (/\s/.test(char)) {
      advance();
      continue;
    }

    // Skip comments
    if (char === '#') {
      while (current < input.length && input[current] !== '\n') {
        advance();
      }
      continue;
    }

    // Punctuation
    if (/[\[\]\{\}\(\)]/.test(char)) {
      tokens.push({ type: "Punctuation", value: char, line, column });
      advance();
      continue;
    }

    // Operators
    const twoCharOp = input.slice(current, current + 2);
    
    if (twoCharOp === '==' || twoCharOp === '!=' || twoCharOp === '=~' || twoCharOp === '!~' || twoCharOp === '&&' || twoCharOp === '||' || twoCharOp === '=>') {
      tokens.push({ type: "Operator", value: twoCharOp, line, column });
      advance(2);
      continue;
    }
    
    if (char === '!' || char === ',') { // comma as punctuation or operator
      tokens.push({ type: "Operator", value: char, line, column });
      advance();
      continue;
    }
    
    if (char === '=') {
      throw new Error(`Unrecognized character '=' at line ${line}, col ${column}. Logstash uses '=>' for assignment and '==' for comparison. If you are trying to write VRL, please switch the engine to Vector (VRL) at the top.`);
    }

    // String literals
    if (char === '"' || char === "'") {
      const quote = char;
      const startCol = column;
      const startLine = line;
      let value = "";
      advance(); // skip opening quote
      
      while (current < input.length && input[current] !== quote) {
        if (input[current] === '\\') {
          advance(); // skip backslash
          if (current < input.length) {
            value += input[current]; // simplistic escape handling
            advance();
          }
        } else {
          value += input[current];
          advance();
        }
      }
      if (current < input.length && input[current] === quote) {
        advance(); // skip closing quote
      }
      tokens.push({ type: "String", value, line: startLine, column: startCol });
      continue;
    }

    // Regex literals
    if (char === '/') {
      const startCol = column;
      const startLine = line;
      let value = "";
      advance(); // skip opening slash
      
      while (current < input.length && input[current] !== '/') {
        if (input[current] === '\\') {
          value += input[current];
          advance();
          if (current < input.length) {
            value += input[current];
            advance();
          }
        } else {
          value += input[current];
          advance();
        }
      }
      if (current < input.length && input[current] === '/') {
        advance(); // skip closing slash
      }
      tokens.push({ type: "Regex", value, line: startLine, column: startCol });
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z0-9_\-\.\?\:]/.test(char)) {
      const startCol = column;
      const startLine = line;
      let value = "";
      
      while (current < input.length && /[a-zA-Z0-9_\-\.\?\:]/.test(input[current])) {
        value += input[current];
        advance();
      }
      
      const keywords = ["if", "else", "mutate", "add_field", "remove_field", "filter", "in", "not", "and", "or", "json", "split", "source", "field"];
      if (keywords.includes(value)) {
        tokens.push({ type: "Keyword", value, line: startLine, column: startCol });
      } else {
        tokens.push({ type: "Identifier", value, line: startLine, column: startCol });
      }
      continue;
    }

    // Unrecognized character
    throw new Error(`Unrecognized character '${char}' at line ${line}, col ${column}`);
  }

  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
}
