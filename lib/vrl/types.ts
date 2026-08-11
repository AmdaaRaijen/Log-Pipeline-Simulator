export type FieldPath = string[];

export type Expr =
  | { type: "fieldRef"; path: FieldPath }
  | { type: "stringLiteral"; value: string }
  | { type: "regexLiteral"; pattern: string; flags: string }
  | { type: "arrayLiteral"; elements: Expr[] }
  | { type: "functionCall"; name: string; fallible: boolean; args: Expr[] };

export type Condition =
  | { type: "equals"; left: Expr; right: Expr; negate: boolean }
  | { type: "functionCall"; name: string; args: Expr[]; negate: boolean; fallible: boolean } 
  | { type: "and"; left: Condition; right: Condition }
  | { type: "or"; left: Condition; right: Condition }
  | { type: "not"; inner: Condition };

export type Assignment = {
  targetPath: FieldPath;
  valueExpr: Expr;
};

export type VrlStage = {
  condition: Condition | null;
  assignments: Assignment[];
  sourceLine: number;
  disabled?: boolean;
  rawText?: string;
};

export type ParsedVrlPipeline = {
  stages: VrlStage[];
};

export type Token = {
  type: "Keyword" | "Identifier" | "String" | "RawRegex" | "Operator" | "Punctuation" | "EOF";
  value: string;
  line: number;
  column: number;
};
