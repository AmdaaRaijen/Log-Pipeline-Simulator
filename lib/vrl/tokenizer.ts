import { Token } from "./types";

export type TokenizeResult = {
  tokens: Token[];
  disabledBlocks: string[]; // Raw text of comment blocks that look like disabled rules
};

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  const disabledBlocks: string[] = [];
  
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

  // Pre-process to extract comment blocks that look like disabled rules
  const lines = input.split('\n');
  let currentCommentBlock: string[] = [];
  let currentCommentLineStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('#')) {
      if (currentCommentBlock.length === 0) {
        currentCommentLineStart = i + 1;
      }
      currentCommentBlock.push(l.substring(1).trim()); // strip '#'
    } else {
      if (currentCommentBlock.length > 0) {
        const joined = currentCommentBlock.join('\n');
        // Check if it looks like a rule (has 'if' and '{')
        if (joined.includes('if ') && joined.includes('{')) {
          disabledBlocks.push(joined);
        }
        currentCommentBlock = [];
      }
    }
  }
  if (currentCommentBlock.length > 0) {
    const joined = currentCommentBlock.join('\n');
    if (joined.includes('if ') && joined.includes('{')) {
      disabledBlocks.push(joined);
    }
  }

  while (current < input.length) {
    let char = input[current];

    if (/\s/.test(char)) {
      advance();
      continue;
    }

    if (char === '#') {
      while (current < input.length && input[current] !== '\n') {
        advance();
      }
      continue;
    }

    if (/[\[\]\{\}\(\)]/.test(char)) {
      tokens.push({ type: "Punctuation", value: char, line, column });
      advance();
      continue;
    }

    const twoCharOp = input.slice(current, current + 2);
    if (twoCharOp === '==' || twoCharOp === '!=' || twoCharOp === '&&' || twoCharOp === '||') {
      tokens.push({ type: "Operator", value: twoCharOp, line, column });
      advance(2);
      continue;
    }
    
    if (char === '!' || char === ',' || char === '=') {
      tokens.push({ type: "Operator", value: char, line, column });
      advance();
      continue;
    }

    if (char === '"') {
      const startCol = column;
      const startLine = line;
      let value = "";
      advance();
      
      while (current < input.length && input[current] !== '"') {
        if (input[current] === '\\') {
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
      if (current < input.length && input[current] === '"') {
        advance();
      }
      tokens.push({ type: "String", value, line: startLine, column: startCol });
      continue;
    }

    // Raw Regex Literal `r'...'`
    if (char === 'r' && input[current + 1] === "'") {
      const startCol = column;
      const startLine = line;
      advance(2); // skip r'
      let value = "";
      while (current < input.length && input[current] !== "'") {
        value += input[current];
        advance();
      }
      if (current < input.length && input[current] === "'") {
        advance();
      }
      tokens.push({ type: "RawRegex", value, line: startLine, column: startCol });
      continue;
    }
    
    // Identifier, keywords, and field paths (.field)
    // VRL paths start with .
    if (/[a-zA-Z0-9_\-\.]/.test(char)) {
      const startCol = column;
      const startLine = line;
      let value = "";
      
      while (current < input.length && /[a-zA-Z0-9_\-\.]/.test(input[current])) {
        value += input[current];
        advance();
      }
      
      // Fallible function suffix e.g. `to_string!`
      if (current < input.length && input[current] === '!') {
         // only if followed by '('
         let peekCurrent = current + 1;
         while (peekCurrent < input.length && /\s/.test(input[peekCurrent])) {
            peekCurrent++;
         }
         if (peekCurrent < input.length && input[peekCurrent] === '(') {
            value += '!';
            advance();
         }
      }

      if (value === "if" || value === "else" || value === "true" || value === "false") {
        tokens.push({ type: "Keyword", value, line: startLine, column: startCol });
      } else {
        tokens.push({ type: "Identifier", value, line: startLine, column: startCol });
      }
      continue;
    }

    throw new Error(`Unrecognized character '${char}' at line ${line}, col ${column}`);
  }

  tokens.push({ type: "EOF", value: "", line, column });
  return { tokens, disabledBlocks };
}
