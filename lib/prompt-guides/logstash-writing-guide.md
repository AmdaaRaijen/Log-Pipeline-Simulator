# Logstash Whitelist Rule — Guide untuk LLM

> **Beda penting dari guide VRL**: parser Logstash kamu (`tokenizer.ts` + `logstash-parser.ts`) itu **custom, cuma support subset grammar** — bukan compiler Logstash asli. Jadi guide ini bukan "syntax Logstash secara umum", tapi **persis apa yang parser kamu bisa proses**, diambil langsung dari kode. Kalau LLM nulis syntax Logstash yang valid di Logstash asli tapi gak ada di daftar bawah, parser kamu akan gagal — bukan karena rule-nya salah, tapi karena parsernya belum mendukung.

## Field Path
- **SELALU** bracket notation: `[field]`, `[nested][path]`.
- Jangan pakai dot notation (`field.nested`) — itu syntax VRL, bukan Logstash simulator ini.

## Operator yang Didukung (HANYA ini)
| Operator | Kegunaan | Syarat |
|---|---|---|
| `==`, `!=` | equality | value di kanan **harus string berkutip**: `"value"` |
| `=~`, `!~` | regex match/not-match | value di kanan **harus regex literal** `/pattern/`, **BUKAN** string `"pattern"` |
| `in [...]`, `not in [...]` | membership | `[...]` bisa literal list string `["a","b"]` **atau** field reference `[tags]` (tanpa kutip = field ref) |
| `and`, `or`, `&&`, `\|\|` | logika | kedua bentuk didukung, bebas pilih salah satu |
| `not`, `!` | negasi | prefix di depan kondisi atau field: `!condition`, `![field]` |
| `( ... )` | grouping | didukung |
| `if [field] { ... }` | existence/truthy check | field ada & tidak kosong |
| `if ![field] { ... }` | negasi existence | field tidak ada / kosong |

**TIDAK ADA dukungan untuk**: `>`, `<`, `>=`, `<=`, atau operator numerik lain. **Jangan pernah generate ini** — parser akan throw `Unsupported operator`.

## Regex (`=~` / `!~`) — Aturan Ketat
- Delimiter **harus** `/pattern/`, contoh: `/(?i)tcpdump/`
- Case-insensitive: prefix **`(?i)` harus persis di awal pattern**. Kalau `(?i)` ditaruh di tengah pattern, parser **tidak** akan mengekstraknya jadi flag — hasilnya regex rusak/salah match.
  - ✅ `/(?i)CompatTelRunner\.exe/`
  - ❌ `/CompatTelRunner\.(?i)exe/`
- Kalau pattern-nya sendiri mengandung karakter `/` (contoh path Unix), escape dengan `\/`: `/\/opt\/metasploit-framework\/data\//`

## `in [...]` — Literal List vs Field Reference
```
[indicators][value] in ["a", "b", "c"]     # literal list — anggota harus string berkutip
[hostname] in [known_hosts]                # field reference — TANPA kutip di dalam bracket
"_jsonparsefailure" in [tags]              # string literal di kiri, field ref di kanan
```

## Action yang Didukung di Rule Whitelist
**HANYA** `mutate { add_field => { ... } }`. Value di dalamnya **selalu string berkutip**.

❌ **JANGAN generate** `remove_field`, `update`, `replace`, `rename` di dalam blok if/else-if whitelist — parser versi ini (`parseActions`) **tidak memproses action selain `add_field`** di rule whitelist. Kalau LLM tetap menulisnya, token-nya akan dilewati diam-diam (tidak error, tapi actionnya hilang) — hasilnya rule kelihatan "berhasil di-parse" tapi behaviornya gak sesuai yang diminta.

## Contoh BENAR

```
else if [hostname] == "REDACTED.intra.com.co.id" and [indicators][value] == "PAK_Generic.001" {
  mutate {
    add_field => {
      "whitelisted" => "true"
      "whitelistId" => "__WHITELIST_ID__"
    }
  }
}
```

## Contoh SALAH (jangan pernah generate seperti ini)

```
else if [hostname] == REDACTED.intra.com.co.id { ... }         # value harus dikutip, jangan bareword
else if [score] > 50 { ... }                                     # operator > tidak didukung sama sekali
else if [path] =~ "C:\\Program.*" { ... }                        # =~ butuh /regex/ bukan string
else if [model] == "X" {
  mutate { remove_field => ["y"] }                                # remove_field tidak diproses di rule whitelist
}
else if [signature] =~ /X.(?i)Y/ { ... }                          # (?i) harus di awal pattern, bukan di tengah
```

## Checklist Sebelum Output Snippet
1. Semua field path pakai `[bracket][notation]`?
2. Semua value di `==`/`!=`/`add_field` dikutip?
3. Regex (kalau ada) pakai `/pattern/`, dan `(?i)` (kalau ada) di paling awal?
4. Tidak ada operator `>`/`<`/`>=`/`<=`?
5. Action cuma `mutate { add_field => {...} }`, tidak ada `remove_field`/`update`/dll?
6. `whitelistId` pakai placeholder `"__WHITELIST_ID__"` (bukan angka literal — biar gak collision sama ID yang udah dipakai di config production)?
