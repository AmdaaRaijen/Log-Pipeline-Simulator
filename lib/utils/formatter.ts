export function formatCode(code: string, language: "json" | "logstash" | "vector"): string {
  if (language === "json") {
    try {
      return JSON.stringify(JSON.parse(code), null, 2);
    } catch {
      return code; // Return as is if invalid JSON
    }
  }

  // Basic formatter for Logstash and Vector VRL
  // 1. Add newlines around braces
  let formatted = code
    .replace(/\s*{\s*/g, " {\n")
    .replace(/\s*}\s*/g, "\n}\n");

  if (language === "vector") {
    // Vector specific: Try to separate multiple field assignments on the same line
    // e.g., `.whitelisted = "true" .whitelistID = "1"` -> newline before `.whitelistID`
    formatted = formatted
      .replace(/"\s+\./g, '"\n.')
      .replace(/'\s+\./g, "'\n.")
      .replace(/}\s+\./g, '}\n.');
      
    // Fix common mistake `.1.` to `[1].` (array access) as a helpful auto-correction
    // since VRL playground complains about FloatLiteral
    formatted = formatted.replace(/\.(\d+)\./g, "[$1].");
  }

  // Split into lines and adjust indentation
  const lines = formatted.split("\n");
  let indent = 0;
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("}")) {
      indent = Math.max(0, indent - 1);
    }

    result.push("  ".repeat(indent) + line);

    // If line ends with '{' or has unclosed '{', increase indent
    // A simple heuristic for '{' at the end of the line
    if (line.endsWith("{")) {
      indent++;
    }
  }

  return result.join("\n");
}
