# VRL Whitelist Rule — Guide untuk LLM

> Karena validasi VRL sekarang pakai **compiler asli** (`vector vrl`, native Rust), LLM **boleh** pakai syntax VRL penuh — beda dari guide Logstash yang dibatasi subset parser custom. Tapi ada pola-pola spesifik yang **terbukti** bikin LLM gagal compile (diambil dari error asli yang kamu temukan, E203 & E110). Guide ini fokus ke situ.

## 1. Array Index — Bracket, BUKAN Dot

VRL **tidak** punya syntax `.field.0.subfield` untuk akses index array. Angka setelah titik ditafsir sebagai awal token angka (`FloatLiteral`), bukan index — makanya errornya `unexpected syntax token: "FloatLiteral"` (E203).

- ❌ `.process_chain.1.command`
- ✅ `.process_chain[1].command`

## 2. Fungsi seperti `match()`/`contains()` Butuh Tipe String yang Pasti

Field yang diakses dari event eksternal **selalu bertipe `any`** (dynamic) di mata type-checker VRL, walau isinya "keliatan" string. Fungsi seperti `match()` mensyaratkan parameter bertipe `string` **pasti**, bukan `any` — kalau langsung dipakai tanpa coercion, muncul error **E110 (fallible predicate)**.

- ❌ `match(.process_chain[1].command, r'pattern')`
- ✅ (aman, gak abort walau field kosong/null):
  ```
  match(to_string(.process_chain[1].command) ?? "", r'pattern')
  ```
- ✅ (strict, abort kalau field gak ada/salah tipe — **hanya** pakai kalau sudah ada `exists()` check untuk field **yang sama**):
  ```
  exists(.process_chain[1].command) && match(to_string!(.process_chain[1].command), r'pattern')
  ```

⚠️ **Kesalahan umum**: `exists(.whitelisted)` **tidak** melindungi coercion field lain seperti `.path` atau `.process_chain[1].command`. Existence check harus terhadap field yang **sama** dengan yang mau di-coerce/dipakai fungsi fallible, bukan field lain yang gak terkait.

**Rekomendasi default**: pakai pola `to_string(x) ?? "fallback"` (infallible + default), **bukan** `to_string!(x)`/`string!(x)` (abort), kecuali memang sudah ada `exists()` guard untuk field yang sama persis. Alasan: satu field yang gak terduga hilang gak boleh bikin **seluruh rule** gagal total (abort menghentikan eksekusi script), cukup bikin kondisi itu `false` dan lanjut evaluasi rule lain.

## 3. Regex — Raw String Literal

- Pakai `r'pattern'` (petik satu, prefix `r`), **bukan** `"pattern"` biasa.
- Inline flag `(?i)` boleh diletakkan di awal pattern raw string — Rust regex crate (dipakai VRL) native support ini, beda dari JS regex.
  - ✅ `r'(?i)CompatTelRunner\.exe\s+-m:appraiser\.dll'`

## 4. Pemisah Statement

Tiap statement (assignment, kondisi) **harus** dipisah baris baru atau `;` — jangan digabung dalam satu baris tanpa separator.

- ❌ `.whitelisted = "true" .whitelistID = "id"`
- ✅
  ```
  .whitelisted = "true"
  .whitelistID = "id"
  ```

## 5. Field Path Umum

- Nested object: `.a.b.c`
- Index array: `.a[0]`, `.a[0].b[1].c`
- Key dengan karakter spesial (spasi, strip, dll): `.a["key-dengan-strip"]`

## 6. Placeholder Whitelist ID

Selalu gunakan placeholder **`"__WHITELIST_ID__"`** untuk `.whitelistID`/`.whitelistId`, bukan angka literal — sistem akan replace placeholder ini dengan ID yang benar setelah verifikasi, biar gak collision sama ID yang sudah dipakai di config production.

## Contoh BENAR (dari kasus nyata kamu, sudah diperbaiki)

```
if !exists(.whitelisted) && match(to_string(.process_chain[1].command) ?? "", r'(?i)CompatTelRunner\.exe\s+-m:appraiser\.dll') && match(to_string(.process_chain[0].command) ?? "", r'(?i)powershell\.exe.*HKLM:\\SOFTWARE\\Microsoft\\CTF\\TIP') {
  .whitelisted = "true"
  .whitelistID = "__WHITELIST_ID__"
}
```

## Contoh SALAH (jangan generate seperti ini)

```
if !exists(.whitelisted) && match(.process_chain.1.command, r'pattern') { ... }
# ❌ dot-index (.1) + tanpa coercion

if !exists(.whitelisted) && match(to_string!(.path), r'pattern') { ... }
# ❌ to_string! abort kalau .path gak ada, dan gak ada exists(.path) guard duluan

if !exists(.whitelisted) && .desc == 'text' { .whitelisted = "true" .whitelistID = "1" }
# ❌ dua masalah: 'text' pakai petik satu utk string biasa (harusnya "text"), dan dua statement digabung 1 baris tanpa separator
```

## Checklist Sebelum Output Snippet
1. Semua akses array pakai `[index]`, tidak ada `.angka`?
2. Setiap `match()`/`contains()`/fungsi sejenis, argumennya sudah di-coerce (`to_string(x) ?? "..."` atau dilindungi `exists()` field yang sama)?
3. Regex pakai `r'...'`, bukan `"..."`?
4. Tiap statement di baris terpisah atau dipisah `;`?
5. `.whitelistID` pakai `"__WHITELIST_ID__"`?
