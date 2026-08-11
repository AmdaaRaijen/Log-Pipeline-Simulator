import { Token, ParsedVrlPipeline, VrlStage, Condition, Expr, FieldPath, Assignment } from "./types";
import { tokenize } from "./tokenizer";

export class ParseError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`${message} at line ${line}, col ${column}`);
  }
}

export class VrlParser {
  private current = 0;

  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private match(type: string, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type === type && (value === undefined || token.value === value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: string, value: string, message: string): Token {
    if (this.isAtEnd()) throw new ParseError(message, this.peek().line, this.peek().column);
    const token = this.peek();
    if (token.type === type && token.value === value) {
      return this.advance();
    }
    throw new ParseError(message, token.line, token.column);
  }

  public parse(): ParsedVrlPipeline {
    const stages: VrlStage[] = [];

    while (!this.isAtEnd()) {
      if (this.match("Keyword", "if")) {
        stages.push(this.parseIfBlock());
      } else {
        this.advance(); // Skip unrecognized top-level tokens
      }
    }

    return { stages };
  }

  private parseIfBlock(): VrlStage {
    const sourceLine = this.tokens[this.current - 1].line;
    const condition = this.parseCondition();
    this.consume("Punctuation", "{", "Expected '{' after condition");
    const assignments = this.parseAssignments();
    this.consume("Punctuation", "}", "Expected '}' after block");

    return { condition, assignments, sourceLine };
  }

  private parseAssignments(): Assignment[] {
    const assignments: Assignment[] = [];
    while (!this.isAtEnd() && !(this.peek().type === "Punctuation" && this.peek().value === "}")) {
      // Expecting `.field = expr`
      if (this.peek().type === "Identifier" && this.peek().value.startsWith(".")) {
        const targetPath = this.parseFieldPath();
        this.consume("Operator", "=", "Expected '=' in assignment");
        const valueExpr = this.parseExpr();
        assignments.push({ targetPath, valueExpr });
      } else {
        this.advance(); // Skip 
      }
    }
    return assignments;
  }

  private parseCondition(): Condition {
    return this.parseOr();
  }

  private parseOr(): Condition {
    let expr = this.parseAnd();
    while (this.match("Operator", "||")) {
      const right = this.parseAnd();
      expr = { type: "or", left: expr, right };
    }
    return expr;
  }

  private parseAnd(): Condition {
    let expr = this.parseNot();
    while (this.match("Operator", "&&")) {
      const right = this.parseNot();
      expr = { type: "and", left: expr, right };
    }
    return expr;
  }

  private parseNot(): Condition {
    if (this.match("Operator", "!")) {
      return { type: "not", inner: this.parsePrimaryCondition() };
    }
    return this.parsePrimaryCondition();
  }

  private parsePrimaryCondition(): Condition {
    if (this.match("Punctuation", "(")) {
      const expr = this.parseCondition();
      this.consume("Punctuation", ")", "Expected ')'");
      return expr;
    }

    const expr = this.parseExpr();

    // If it's followed by an equality operator
    if (this.match("Operator", "==") || this.match("Operator", "!=")) {
      const op = this.tokens[this.current - 1].value;
      const right = this.parseExpr();
      return { type: "equals", left: expr, right, negate: op === "!=" };
    }

    // If it's a standalone function call used as a boolean (e.g. exists(.foo), match(...))
    if (expr.type === "functionCall") {
      return { type: "functionCall", name: expr.name, args: expr.args, negate: false, fallible: expr.fallible };
    }

    throw new ParseError("Expected condition", this.peek().line, this.peek().column);
  }

  private parseExpr(): Expr {
    const token = this.peek();

    if (this.match("Punctuation", "[")) {
      const elements: Expr[] = [];
      while (!this.match("Punctuation", "]")) {
        elements.push(this.parseExpr());
        this.match("Operator", ","); // Optional comma
      }
      return { type: "arrayLiteral", elements };
    }

    if (token.type === "String") {
      this.advance();
      return { type: "stringLiteral", value: token.value };
    }

    if (token.type === "RawRegex") {
      this.advance();
      // Extract flags if any. VRL raw regex is r'(?i)pattern'.
      let pattern = token.value;
      let flags = "";
      if (pattern.startsWith("(?i)")) {
         flags = "i";
         pattern = pattern.substring(4);
      }
      return { type: "regexLiteral", pattern, flags };
    }

    if (token.type === "Identifier") {
      if (token.value.startsWith(".")) {
        return { type: "fieldRef", path: this.parseFieldPath() };
      }
      
      // Could be a function call `name(...)` or `name!(...)`
      const name = token.value;
      this.advance();
      const fallible = name.endsWith("!");
      const funcName = fallible ? name.slice(0, -1) : name;

      if (this.match("Punctuation", "(")) {
        const args: Expr[] = [];
        while (!this.match("Punctuation", ")")) {
          args.push(this.parseExpr());
          this.match("Operator", ",");
        }
        return { type: "functionCall", name: funcName, fallible, args };
      }
      
      throw new ParseError(`Expected function call or field ref, got ${name}`, token.line, token.column);
    }

    throw new ParseError(`Unexpected token ${token.value}`, token.line, token.column);
  }

  private parseFieldPath(): FieldPath {
    const token = this.consume("Identifier", this.peek().value, "Expected field path");
    const val = token.value; // e.g. ".process_chain"
    
    // We parse basic VRL dot notation: .a.b or .a[0].b
    // Since tokenizer treats `.process_chain` as one identifier, we just split it
    const parts = val.replace(/^\./, '').split('.');
    
    const path: string[] = [];
    for (const part of parts) {
      if (part.includes('[')) {
        // e.g. process_chain[1]
        const m = part.match(/^([^\[]+)\[(\d+)\]$/);
        if (m) {
           path.push(m[1], m[2]);
        } else {
           path.push(part);
        }
      } else {
        path.push(part);
      }
    }

    // Sometimes the tokenizer stops at `[` so we might have `[` as a token right after the identifier
    while (this.match("Punctuation", "[")) {
      const idxToken = this.advance();
      path.push(idxToken.value);
      this.consume("Punctuation", "]", "Expected ']'");
    }

    return path;
  }
}

// Utility to parse script + parse disabled blocks
export function parseVrlScript(input: string): ParsedVrlPipeline {
  const { tokens, disabledBlocks } = tokenize(input);
  const parser = new VrlParser(tokens);
  const pipeline = parser.parse();

  // Attach disabled blocks
  for (const block of disabledBlocks) {
     pipeline.stages.push({
        condition: null,
        assignments: [],
        sourceLine: 0,
        disabled: true,
        rawText: block
     });
  }

  return pipeline;
}
