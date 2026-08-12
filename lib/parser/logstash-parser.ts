import { Token, ParsedPipeline, Rule, Condition, FieldPath, MutateAction, ParsedFilterPipeline, Stage, PluginConfig, IfBlock } from "./types";

export class ParseError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`${message} at line ${line}, col ${column}`);
  }
}

export class LogstashParser {
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

  // Backwards compatibility for v1 Exclude Simulator
  public parse(): ParsedPipeline {
    const filters: Rule[] = [];
    let wrappedInFilter = false;
    if (this.match("Keyword", "filter")) {
      this.consume("Punctuation", "{", "Expected '{' after filter");
      wrappedInFilter = true;
    }

    const ifBlocks: IfBlock[] = [];
    let branchIndex = 0;

    while (!this.isAtEnd()) {
      if (wrappedInFilter && this.peek().type === "Punctuation" && this.peek().value === "}") {
        break;
      }
      
      const token = this.peek();
      if (token.type === "Keyword" && token.value === "if") {
        const block = this.parseIfBlock(branchIndex);
        ifBlocks.push(block);
        branchIndex += block.branches.length;
      } else {
        this.advance();
      }
    }

    if (wrappedInFilter) {
      this.consume("Punctuation", "}", "Expected '}' at end of filter block");
    }

    return { ifBlocks };
  }

  private parseIfBlock(branchIndex: number): IfBlock {
    const branches: Rule[] = [];
    this.consume("Keyword", "if", "Expected 'if'");
    const sourceLine = this.peek().line;
    const condition = this.parseCondition();
    this.consume("Punctuation", "{", "Expected '{' after condition");
    const actions = this.parseActions();
    this.consume("Punctuation", "}", "Expected '}' after actions");
    
    branches.push({ condition, actions, sourceLine, branchIndex });
    branchIndex++;

    while (this.match("Keyword", "else")) {
      const elseLine = this.peek().line;
      if (this.match("Keyword", "if")) {
        const elseIfCondition = this.parseCondition();
        this.consume("Punctuation", "{", "Expected '{' after else if condition");
        const elseIfActions = this.parseActions();
        this.consume("Punctuation", "}", "Expected '}' after else if actions");
        branches.push({ condition: elseIfCondition, actions: elseIfActions, sourceLine: elseLine, branchIndex });
        branchIndex++;
      } else {
        this.consume("Punctuation", "{", "Expected '{' after else");
        const elseActions = this.parseActions();
        this.consume("Punctuation", "}", "Expected '}' after else actions");
        branches.push({ condition: null, actions: elseActions, sourceLine: elseLine, branchIndex });
        break;
      }
    }
    
    return { branches };
  }

  // --- V2 Parse Sequential Filter Pipeline ---
  public parseSequential(): ParsedFilterPipeline {
    const stages: Stage[] = [];
    
    let wrappedInFilter = false;
    if (this.match("Keyword", "filter")) {
      this.consume("Punctuation", "{", "Expected '{' after filter");
      wrappedInFilter = true;
    }

    while (!this.isAtEnd()) {
      if (wrappedInFilter && this.peek().type === "Punctuation" && this.peek().value === "}") {
        break;
      }

      const token = this.peek();
      if (token.type === "Keyword" && token.value === "if") {
        this.parseSequentialIfBlock(stages);
      } else if (token.type === "Keyword" && ["mutate", "json", "split"].includes(token.value)) {
        // Top-level plugin without condition
        const sourceLine = token.line;
        const pluginName = this.advance().value;
        const pluginConfig = this.parsePluginConfig();
        stages.push({ condition: null, pluginName, pluginConfig, sourceLine });
      } else {
        this.advance();
      }
    }

    if (wrappedInFilter) {
      this.consume("Punctuation", "}", "Expected '}' at end of filter block");
    }

    return { stages };
  }

  private parseSequentialIfBlock(stages: Stage[], conditionPrefix: Condition | null = null) {
    this.consume("Keyword", "if", "Expected 'if'");
    let condition = this.parseCondition();
    if (conditionPrefix) {
      condition = { type: "and", left: conditionPrefix, right: condition };
    }
    
    this.consume("Punctuation", "{", "Expected '{' after condition");
    
    // Parse plugins inside if block
    while (!this.isAtEnd() && !(this.peek().type === "Punctuation" && this.peek().value === "}")) {
      const token = this.peek();
      if (token.type === "Keyword" && ["mutate", "json", "split"].includes(token.value)) {
        const sourceLine = token.line;
        const pluginName = this.advance().value;
        const pluginConfig = this.parsePluginConfig();
        stages.push({ condition, pluginName, pluginConfig, sourceLine });
      } else {
        this.advance(); // Skip unhandled
      }
    }
    this.consume("Punctuation", "}", "Expected '}' after if block");

    // We don't fully flatten `else if` into sequential, but we can treat `else if C` as `if (!prev && C)`
    // For simplicity in this simulator, assuming `else` applies to the negative of the `if`.
    // Actually, `50_filter.conf` usually doesn't nest complex `else` for splits, but let's handle it basically:
    if (this.match("Keyword", "else")) {
      const notCondition: Condition = { type: "not", inner: condition };
      if (this.peek().type === "Keyword" && this.peek().value === "if") {
        // else if
        this.parseSequentialIfBlock(stages, notCondition);
      } else {
        // else
        this.consume("Punctuation", "{", "Expected '{' after else");
        while (!this.isAtEnd() && !(this.peek().type === "Punctuation" && this.peek().value === "}")) {
          const token = this.peek();
          if (token.type === "Keyword" && ["mutate", "json", "split"].includes(token.value)) {
            const sourceLine = token.line;
            const pluginName = this.advance().value;
            const pluginConfig = this.parsePluginConfig();
            stages.push({ condition: notCondition, pluginName, pluginConfig, sourceLine });
          } else {
            this.advance();
          }
        }
        this.consume("Punctuation", "}", "Expected '}' after else block");
      }
    }
  }

  private parsePluginConfig(): PluginConfig {
    this.consume("Punctuation", "{", "Expected '{' after plugin name");
    const fields: Record<string, any> = {};
    
    while (!this.match("Punctuation", "}")) {
      const keyToken = this.advance();
      let key = keyToken.value;
      if (keyToken.type === "String") key = key.replace(/^"|'$/, "");
      
      this.match("Operator", "=>"); 
      
      // Val could be string, or array for remove_field, or nested block
      if (this.match("Punctuation", "[")) {
        // Array of strings (e.g. remove_field => ["a", "b"])
        const arr: string[] = [];
        while (!this.match("Punctuation", "]")) {
          const valToken = this.advance();
          let val = valToken.value;
          if (valToken.type === "String") val = val.replace(/^"|'$/, "");
          arr.push(val);
          this.match("Operator", ",");
        }
        fields[key] = arr;
      } else if (this.match("Punctuation", "{")) {
        // Nested block (e.g. add_field => { ... })
        const nested: Record<string, string> = {};
        while (!this.match("Punctuation", "}")) {
          const nKeyToken = this.advance();
          let nKey = nKeyToken.value;
          if (nKeyToken.type === "String") nKey = nKey.replace(/^"|'$/, "");
          this.match("Operator", "=>");
          const nValToken = this.advance();
          let nVal = nValToken.value;
          if (nValToken.type === "String") nVal = nVal.replace(/^"|'$/, "");
          nested[nKey] = nVal;
          this.match("Operator", ",");
        }
        fields[key] = nested;
      } else {
        const valToken = this.advance();
        let val = valToken.value;
        if (valToken.type === "String") val = val.replace(/^"|'$/, "");
        fields[key] = val;
      }
      
      this.match("Operator", ",");
    }
    
    return { name: "unknown", fields }; // Name isn't strictly needed here as we store it in Stage
  }

  // --- Shared Condition Parsing ---

  private parseCondition(): Condition {
    return this.parseOr();
  }

  private parseOr(): Condition {
    let expr = this.parseAnd();
    while (this.match("Keyword", "or") || this.match("Operator", "||")) {
      const right = this.parseAnd();
      expr = { type: "or", left: expr, right };
    }
    return expr;
  }

  private parseAnd(): Condition {
    let expr = this.parseNot();
    while (this.match("Keyword", "and") || this.match("Operator", "&&")) {
      const right = this.parseNot();
      expr = { type: "and", left: expr, right };
    }
    return expr;
  }

  private parseNot(): Condition {
    if (this.match("Keyword", "not") || this.match("Operator", "!")) {
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

    // truthy negation shortcut `if ![field]`
    if (this.match("Operator", "!")) {
      const field = this.parseFieldPath();
      return { type: "truthy", field, negate: true };
    }

    // It might be a string literal for `in` check, e.g. `"_jsonparsefailure" in [tags]`
    if (this.peek().type === "String") {
      const strVal = this.advance().value.replace(/^"|'$/, "");
      let negate = false;
      if (this.match("Keyword", "not")) {
        negate = true;
      }
      this.consume("Keyword", "in", "Expected 'in'");
      const field = this.parseFieldPath();
      return { type: "inFieldRef", leftField: strVal, rightField: field, negate };
    }

    const field = this.parseFieldPath();
    
    // Check if it's just a truthy check `if [field]` without operator
    if (this.isAtEnd() || 
        this.peek().type === "Keyword" && ["and", "or"].includes(this.peek().value) || 
        this.peek().type === "Operator" && ["&&", "||"].includes(this.peek().value) || 
        this.peek().type === "Punctuation" && [")", "{"].includes(this.peek().value)) {
      return { type: "truthy", field, negate: false };
    }

    const opToken = this.advance();
    
    if (opToken.type !== "Operator" && opToken.type !== "Keyword") {
      throw new ParseError(`Expected operator, got ${opToken.value}`, opToken.line, opToken.column);
    }
    
    const op = opToken.value;

    if (op === "==" || op === "!=") {
      const valueToken = this.advance();
      if (valueToken.type !== "String" && valueToken.type !== "Identifier") throw new ParseError("Expected string after == or !=", valueToken.line, valueToken.column);
      let val = valueToken.value;
      if (valueToken.type === "String") val = val.replace(/^"|'$/, "");
      return { type: "equals", field, value: val, negate: op === "!=" };
    } else if (op === "=~" || op === "!~") {
      const valueToken = this.advance();
      if (valueToken.type !== "Regex") throw new ParseError("Expected regex after =~ or !~", valueToken.line, valueToken.column);
      
      let pattern = valueToken.value;
      let flags = "";
      if (pattern.startsWith("(?i)")) {
        flags = "i";
        pattern = pattern.substring(4);
      }
      return { type: "regexMatch", field, pattern, flags, negate: op === "!~" };
    } else if (op === "not" || op === "in") {
      let negate = false;
      if (op === "not") {
        this.consume("Keyword", "in", "Expected 'in' after 'not'");
        negate = true;
      }
      
      // If it's a field path reference instead of array literal:
      if (this.peek().type === "Punctuation" && this.peek().value === "[") {
        // Lookahead to see if it's a literal list or a field ref
        let isLiteral = false;
        let currentIdx = this.current;
        // peek next tokens: if it's a string then comma/bracket, it's literal
        let lookToken = this.tokens[currentIdx + 1];
        if (lookToken && (lookToken.type === "String" || lookToken.type === "Punctuation" && lookToken.value === "]")) {
          isLiteral = true;
        }

        if (isLiteral) {
          this.consume("Punctuation", "[", "Expected '[' for list");
          const values: string[] = [];
          while (!this.match("Punctuation", "]")) {
            const valToken = this.advance();
            if (valToken.type !== "String") throw new ParseError("Expected string in list", valToken.line, valToken.column);
            values.push(valToken.value.replace(/^"|'$/, ""));
            this.match("Operator", ","); 
          }
          return { type: "in", field, values, negate };
        } else {
          // It's a field path like `[tags]`
          const rightField = this.parseFieldPath();
          // For `inFieldRef`, leftField is actually `field` string since it was parsed as FieldPath but we only support string literals for left side usually, 
          // but Logstash allows field in field? Let's just assume we want it. We'll stringify leftField if it was parsed as path.
          const leftFieldStr = field.length === 1 ? field[0] : field.join("."); 
          return { type: "inFieldRef", leftField: leftFieldStr, rightField, negate };
        }
      } else {
          throw new ParseError("Expected '[' after in", opToken.line, opToken.column);
      }
    }

    throw new ParseError(`Unsupported operator ${op}`, opToken.line, opToken.column);
  }

  private parseFieldPath(): FieldPath {
    const path: string[] = [];
    while (this.match("Punctuation", "[")) {
      const id = this.advance();
      let val = id.value;
      if (id.type === "String") {
        val = val.replace(/^"|'$/, ""); 
      }
      path.push(val);
      this.consume("Punctuation", "]", "Expected ']' after field name");
    }
    if (path.length === 0) {
        if (this.peek().type === "Identifier") {
            path.push(this.advance().value);
        } else if (this.peek().type === "String") {
            path.push(this.advance().value.replace(/^"|'$/, ""));
        } else {
            throw new ParseError("Expected field path", this.peek().line, this.peek().column);
        }
    }
    return path;
  }

  // --- V1 Actions (Exclude Simulator) ---
  private parseActions(): MutateAction[] {
    const actions: MutateAction[] = [];
    
    while (!this.isAtEnd() && !(this.peek().type === "Punctuation" && this.peek().value === "}")) {
      if (this.match("Keyword", "mutate")) {
        this.consume("Punctuation", "{", "Expected '{' after mutate");
        while (!this.match("Punctuation", "}")) {
          if (this.match("Keyword", "add_field")) {
            this.match("Operator", "=>"); 
            this.consume("Punctuation", "{", "Expected '{' after add_field");
            const fields: Record<string, string> = {};
            while (!this.match("Punctuation", "}")) {
              const keyToken = this.advance();
              let key = keyToken.value;
              if (keyToken.type === "String") key = key.replace(/^"|'$/, "");
              this.match("Operator", "=>");
              const valToken = this.advance();
              let val = valToken.value;
              if (valToken.type === "String") val = val.replace(/^"|'$/, "");
              fields[key] = val;
              this.match("Operator", ",");
            }
            actions.push({ type: "addField", fields });
          } else {
             this.advance();
          }
        }
      } else {
        this.advance();
      }
    }
    
    return actions;
  }
}
