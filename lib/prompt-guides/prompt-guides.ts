/**
 * Guide konten & helper untuk auto-whitelist LLM prompt.
 * Sumber kebenaran syntax Logstash: logstash-writing-guide.md (digenerate dari review logstash-parser.ts)
 * Sumber kebenaran syntax VRL: vrl-writing-guide.md (digenerate dari error compiler asli E203/E110)
 *
 * Placeholder whitelist ID yang dipakai di seluruh sistem — pakai sentinel yang unik,
 * BUKAN kata generic seperti "id" (field "id" beneran ada di rawlog TrendMicro kamu,
 * risiko ambigu/ke-replace secara gak sengaja kalau post-processing pakai regex naive).
 */
export const WHITELIST_ID_PLACEHOLDER = "__WHITELIST_ID__";

export const LOGSTASH_GUIDE = `
ATURAN SYNTAX LOGSTASH (WAJIB DIIKUTI PERSIS — parser custom, bukan compiler Logstash asli):

FIELD PATH:
- SELALU bracket notation: [field], [nested][path]. JANGAN dot notation.

OPERATOR YANG DIDUKUNG (di luar ini akan gagal parse):
- ==, != → value di kanan HARUS string berkutip "value"
- =~, !~ → value di kanan HARUS regex literal /pattern/ (BUKAN string "pattern")
  - case-insensitive: prefix (?i) HARUS di paling awal pattern, contoh /(?i)tcpdump/. (?i) di tengah TIDAK didukung.
  - escape "/" di dalam pattern jadi "\\/" kalau pattern-nya sendiri mengandung slash
- in [...] / not in [...] → [...] bisa literal list ["a","b"] (anggota berkutip) atau field reference [tags] (tanpa kutip)
- and, or, &&, || → logika, keduanya sah
- not, ! → negasi, prefix di depan kondisi/field
- ( ... ) → grouping didukung
- if [field] { } / if ![field] { } → existence/truthy check

TIDAK DIDUKUNG SAMA SEKALI: >, <, >=, <=, atau operator numerik lain. JANGAN generate ini.

ACTION: HANYA mutate { add_field => { "key" => "value" } }. JANGAN pakai remove_field/update/replace/rename
di rule whitelist — parser tidak memprosesnya (silent-skip, bukan error, tapi actionnya hilang).

WHITELIST ID: gunakan placeholder string "${WHITELIST_ID_PLACEHOLDER}" untuk value "whitelistId", JANGAN angka literal.

CONTOH BENAR:
else if [hostname] == "REDACTED.intra.com.co.id" and [indicators][value] == "PAK_Generic.001" {
  mutate {
    add_field => {
      "whitelisted" => "true"
      "whitelistId" => "${WHITELIST_ID_PLACEHOLDER}"
    }
  }
}
`.trim();

export const VRL_GUIDE = `
ATURAN SYNTAX VRL (validasi pakai compiler asli — syntax VRL lengkap boleh dipakai, TAPI hindari pola berikut
yang TERBUKTI menyebabkan error compile):

1. ARRAY INDEX pakai bracket, BUKAN dot:
   SALAH: .process_chain.1.command  (error E203, dibaca sebagai FloatLiteral)
   BENAR: .process_chain[1].command

2. Fungsi seperti match()/contains() butuh tipe string PASTI, field dari event selalu bertipe "any":
   SALAH: match(.process_chain[1].command, r'pattern')  (error E110, fallible predicate)
   BENAR (default, gak abort kalau field kosong/null):
     match(to_string(.process_chain[1].command) ?? "", r'pattern')
   BENAR (strict, HANYA kalau sudah ada exists() untuk field YANG SAMA):
     exists(.process_chain[1].command) && match(to_string!(.process_chain[1].command), r'pattern')
   PENTING: exists(.whitelisted) TIDAK melindungi coercion field lain seperti .path. Existence check
   harus untuk field yang SAMA yang mau di-coerce.
   DEFAULT: pakai pola "to_string(x) ?? fallback", BUKAN to_string!(x)/string!(x), kecuali sudah ada
   exists() guard untuk field yang sama — satu field hilang gak boleh bikin seluruh rule abort.

3. Regex pakai raw string literal r'pattern' (petik satu, prefix r), BUKAN "pattern" biasa.
   (?i) boleh di awal pattern raw string ini.

4. Tiap statement dipisah baris baru atau ";" — jangan digabung 1 baris tanpa separator.
   SALAH: .whitelisted = "true" .whitelistID = "id"
   BENAR: .whitelisted = "true"\\n.whitelistID = "id"

5. Field path: nested .a.b.c, index array .a[0], key spesial .a["key-dengan-strip"].

WHITELIST ID: gunakan placeholder string "${WHITELIST_ID_PLACEHOLDER}" untuk .whitelistID, JANGAN angka literal.

CONTOH BENAR:
if !exists(.whitelisted) && match(to_string(.process_chain[1].command) ?? "", r'(?i)CompatTelRunner\\.exe') {
  .whitelisted = "true"
  .whitelistID = "${WHITELIST_ID_PLACEHOLDER}"
}
`.trim();

export type Engine = "logstash" | "vector";

export function getEngineGuide(engine: Engine, whitelistMode: "default" | "activity" = "default"): string {
  if (engine === "logstash" && whitelistMode === "activity") {
    return LOGSTASH_GUIDE.replace(
      /mutate \{[\s\S]*?\}/,
      'mutate {\n    add_field => { "[field][log_category]" => "activity" }\n  }'
    ).replace(
      /ACTION: HANYA mutate \{ add_field => \{ "key" => "value" \} \}\./,
      'ACTION: HANYA mutate { add_field => { "[field][log_category]" => "activity" } }.'
    ).replace(
      /WHITELIST ID: gunakan placeholder string "__WHITELIST_ID__" untuk value "whitelistId", JANGAN angka literal\./,
      'WHITELIST ID: tidak diperlukan untuk mode log_category activity.'
    );
  }
  return engine === "logstash" ? LOGSTASH_GUIDE : VRL_GUIDE;
}

/**
 * Bangun system prompt lengkap. Ganti pemakaian string inline di route.ts dengan fungsi ini.
 */
export function buildSystemPrompt(params: {
  engine: Engine;
  flattenedPaths: string[];
  description: string;
  exampleWhitelist?: string;
  whitelistMode?: "default" | "activity";
}): string {
  const { engine, flattenedPaths, description, exampleWhitelist, whitelistMode = "default" } = params;
  return `Kamu adalah asisten pembuat rule whitelist untuk SIEM pipeline (${
    engine === "logstash" ? "Logstash conditional filter" : "Vector VRL"
  }).

${getEngineGuide(engine, whitelistMode)}

ATURAN OUTPUT UMUM:
- Output HANYA satu blok rule (if-block), bukan seluruh file config.
- Field path HARUS diambil dari daftar "Available field paths" di bawah — JANGAN mengarang path yang tidak ada di sana.
- Response harus JSON valid mengikuti schema: { "snippet": "string", "explanation": "string"${whitelistMode === "default" ? ', "suggestedWhitelistId": "string"' : ""} }

KONTEKS:
Available field paths:
${flattenedPaths.join("\n")}

Penjelasan whitelist dari user: ${description}
${exampleWhitelist ? `Contoh whitelist (gaya yang diikuti): ${exampleWhitelist}` : ""}`;
}

/**
 * Peta error compiler/parser -> hint perbaikan yang eksplisit, ditempel ke pesan retry
 * supaya LLM gak cuma dikasih raw error tapi juga arahan konkret cara memperbaiki.
 * Dirancang additive: kalau gak ada pola yang cocok, return string kosong (raw error tetap dikirim apa adanya).
 */
export function mapErrorToHint(engine: Engine, errorMessage: string): string {
  if (!errorMessage) return "";

  if (engine === "vector") {
    if (/E203/.test(errorMessage) || /FloatLiteral/.test(errorMessage)) {
      return 'HINT: Gunakan notasi bracket untuk index array, contoh ".field[1].sub" — JANGAN ".field.1.sub".';
    }
    if (/E110/.test(errorMessage) || /fallible predicate/i.test(errorMessage)) {
      return 'HINT: Field yang diakses bertipe "any". Coercion dulu sebelum dipakai di match()/contains(), pakai pola `to_string(.field) ?? ""` — jangan langsung pakai field mentah atau to_string!() tanpa exists() guard untuk field yang sama.';
    }
    if (/unhandled error/i.test(errorMessage) || /E103/.test(errorMessage)) {
      return 'HINT: Ada function fallible yang errornya belum ditangani. Tambahkan `?? "default"` (infallible+fallback) di belakang function tersebut.';
    }
    if (/unknown function/i.test(errorMessage) || /E105/.test(errorMessage)) {
      return "HINT: Nama fungsi tidak dikenali VRL. Cek kembali penulisan nama fungsi (typo?) atau gunakan fungsi standar VRL yang lain.";
    }
  } else {
    if (/Expected regex after/i.test(errorMessage)) {
      return 'HINT: Untuk operator =~ atau !~, value HARUS regex literal /pattern/, bukan string "pattern".';
    }
    if (/Expected string after == or !=/i.test(errorMessage)) {
      return 'HINT: Value setelah == atau != harus string berkutip, contoh "value", bukan bareword.';
    }
    if (/Unsupported operator/i.test(errorMessage)) {
      return "HINT: Operator ini tidak didukung parser (contoh >, <, >=, <= tidak ada). Gunakan hanya ==, !=, =~, !~, in, not in, and, or, not, !.";
    }
    if (
      /Expected '\['/i.test(errorMessage) ||
      /Expected field path/i.test(errorMessage)
    ) {
      return "HINT: Field path harus pakai bracket notation [field][nested], bukan dot notation.";
    }
  }
  return "";
}

/**
 * Deteksi apakah sebuah error adalah infrastructure/transient error (bukan salah syntax LLM) —
 * kalau iya, JANGAN dikonsumsi sebagai 1 attempt retry LLM, karena minta LLM "perbaiki syntax"
 * gak akan menyelesaikan masalah spawn/binary/network yang sebenarnya.
 */
export function isInfrastructureError(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return /ENOENT|ECONNREFUSED|ETIMEDOUT|spawn .* failed|binary not found|timed out waiting|socket hang up/i.test(
    errorMessage,
  );
}

/**
 * Linter "rule terlalu broad" berbasis heuristik teks — sengaja TIDAK butuh AST penuh,
 * supaya bisa dipakai untuk Logstash MAUPUN Vector (parity — sebelumnya lintWarnings selalu
 * kosong untuk engine "vector" di route.ts karena cuma diimplementasi untuk Logstash AST).
 */
export function lintSnippetSpecificity(
  engine: Engine,
  snippet: string,
): string[] {
  const warnings: string[] = [];

  const fieldRefs =
    engine === "logstash"
      ? new Set(snippet.match(/\[[^\]\[]+\]/g) ?? [])
      : new Set(
          (
            snippet.match(/\.[a-zA-Z_][a-zA-Z0-9_]*(\[[0-9]+\])?/g) ?? []
          ).filter(
            (f) =>
              !f.startsWith(".whitelisted") &&
              !f.startsWith(".whitelistID") &&
              !f.startsWith(".whitelistId"),
          ),
        );

  if (fieldRefs.size < 2) {
    warnings.push(
      "⚠️ Kondisi ini kelihatannya cuma merujuk 1 field kondisi — pertimbangkan tambah kondisi lain biar rule lebih spesifik dan gak over-whitelist event lain yang mirip.",
    );
  }

  const hasContains = /contains\(/.test(snippet);
  const hasAnchoredRegex = /r'\^/.test(snippet) || /\/\^/.test(snippet);
  if (hasContains && !hasAnchoredRegex) {
    warnings.push(
      "⚠️ Rule ini pakai substring match (contains) tanpa regex ber-anchor — pertimbangkan match() dengan pattern ^...$ kalau butuh kecocokan lebih presisi.",
    );
  }

  const hasUnanchoredShortRegex =
    engine === "vector"
      ? /r'[^^][^']{0,4}'/.test(snippet)
      : /\/[^^][^/]{0,4}\//.test(snippet);
  if (hasUnanchoredShortRegex) {
    warnings.push(
      "⚠️ Ada pattern regex pendek (<5 karakter) tanpa anchor — rawan false-positive ke value lain yang kebetulan mengandung substring itu.",
    );
  }

  return warnings;
}
