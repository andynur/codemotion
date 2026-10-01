# PRD: Code Motion Visualizer

| Field | Isi |
|---|---|
| Versi dokumen | 1.0 |
| Tanggal | 2026-10-01 |
| Pemilik | Andy Nur |
| Status produk | MVP selesai diimplementasikan, menunggu commit dan verifikasi akhir |
| Sumber spesifikasi | [MASTER_PROMPT.md](../MASTER_PROMPT.md), [AGENTS.md](../AGENTS.md), [DESIGN.md](../DESIGN.md) |

Legenda checklist: `[x]` selesai dan terverifikasi, `[ ]` belum dikerjakan atau belum diverifikasi.

---

## 1. Ringkasan

Code Motion Visualizer adalah web app yang berjalan sepenuhnya di browser untuk mengajarkan dasar pemrograman. Pengguna menulis JavaScript di editor sebelah kiri. Panel kanan (stage) menganimasikan eksekusi kode langkah demi langkah: variabel, loop, percabangan, array, dan (di luar MVP) fungsi beserta call stack.

Tidak ada backend, database, atau autentikasi.

## 2. Latar belakang dan masalah

- Pemula sulit membayangkan apa yang terjadi di memori saat kode berjalan.
- Debugger biasa terlalu teknis dan tidak menampilkan perubahan state secara visual.
- Visualizer yang ada sering butuh server untuk mengeksekusi kode, sehingga tidak bisa dipakai offline atau dibagikan dengan mudah.

## 3. Tujuan

| ID | Tujuan | Ukuran keberhasilan |
|---|---|---|
| G1 | Menampilkan eksekusi kode secara visual dan bisa diputar mundur | Setiap step bisa dirender sendiri; Step back, scrub, dan Play berjalan |
| G2 | Aman dan responsif | Infinite loop berhenti di batas 5.000 step; tab tetap responsif |
| G3 | Konsisten dengan design system | Semua warna, spacing, radius, shadow, dan durasi motion berasal dari `tokens.css` |
| G4 | Ringan dan minim dependensi | Hanya paket allowlist; setiap paket dijustifikasi di `docs/DEPENDENCIES.md` |
| G5 | Mudah dibagikan | Kode tersimpan di URL hash; tersedia build satu file HTML yang bisa offline |

### Non-goals

- Eksekusi di server, akun pengguna, penyimpanan cloud.
- Dukungan penuh bahasa JavaScript (class, async, generator, `try/catch`, closure).
- Bahasa pemrograman selain JavaScript.

## 4. Target pengguna

| Persona | Kebutuhan |
|---|---|
| Pelajar pemula | Melihat nilai variabel dan isi array berubah per baris |
| Pengajar | Menyiapkan contoh, membagikan link, memutar demo di kelas |
| Pembuat konten | Menghasilkan screenshot atau rekaman animasi eksekusi |

## 5. User stories

| ID | Sebagai | Saya ingin | Agar |
|---|---|---|---|
| US1 | Pelajar | menulis kode lalu menekan Run | melihat trace eksekusinya |
| US2 | Pelajar | maju dan mundur satu step | memahami efek tiap baris |
| US3 | Pelajar | menggeser scrubber timeline | melompat ke titik mana pun |
| US4 | Pelajar | melihat baris aktif di editor | tahu baris mana yang sedang dieksekusi |
| US5 | Pelajar | mendapat pesan ramah untuk sintaks yang belum didukung, lengkap dengan nomor baris | tahu apa yang harus diperbaiki |
| US6 | Pengajar | memilih preset contoh | langsung mengajar tanpa mengetik |
| US7 | Pengajar | membagikan link berisi kode | murid membuka contoh yang sama |
| US8 | Siapa pun | menjalankan infinite loop tanpa membuat tab hang | aman bereksperimen |
| US9 | Pengguna dengan sensitivitas gerak | animasi berkurang sesuai `prefers-reduced-motion` | nyaman memakai aplikasi |

## 6. Kebutuhan fungsional

### 6.1 Editor

- FR-E1: Editor CodeMirror 6 dengan syntax highlighting JavaScript.
- FR-E2: Highlight baris dari `currentStep`.
- FR-E3: Error trace ditampilkan inline beserta nomor baris.
- FR-E4: Shortcut: `Cmd+Enter` untuk Run, panah untuk step, `Space` untuk Play/Pause.

### 6.2 Tracer

- FR-T1: Parse kode dengan Acorn menjadi AST.
- FR-T2: Instrumentasi dengan acorn-walk. Sisipkan `__t(event)` sebelum dan sesudah statement, saat assignment, saat tes dan iterasi loop, saat pemilihan cabang `if`, dan saat mutasi array.
- FR-T3: Regenerasi kode dengan astring.
- FR-T4: Eksekusi di Web Worker dengan batas 5.000 step dan timeout wall-clock. Main thread menghentikan worker saat timeout.
- FR-T5: Output berupa `Step[]` dengan bentuk `{ id, line, col, kind, scopes, heap, event }`. Nilai di-deep-clone.
- FR-T6: Sintaks di luar subset menghasilkan error "not supported yet" dengan nomor baris.

Subset JavaScript MVP:

- Didukung: `let`/`const`/`var`, number, string, boolean, array, aritmetika, perbandingan, `for`, `while`, `for...of`, `break`, `continue`, `if/else`, `console.log`.
- Method array yang didukung: `push`, `pop`, `shift`, `unshift`, `splice`, `length`, `indexOf`, `includes`.
- Tambahan yang sudah ada (di luar MVP): deklarasi fungsi bernama di top level, parameter, variabel lokal, nilai return, panggilan bersarang, dan rekursi.
- Belum didukung: function expression, arrow function, fungsi bersarang dan closure, class, async, generator, `try/catch`.

### 6.3 Playback

- FR-P1: Kontrol Run, Step back, Step forward, Play/Pause, kecepatan, dan scrubber.
- FR-P2: Playback hanya mengubah `currentStep`.
- FR-P3: Kecepatan Play dihitung dari faktor kecepatan dikali token durasi motion.

### 6.4 Stage

- FR-S1: `VarBox`, kotak berlabel; nilainya beranimasi saat berubah.
- FR-S2: `LoopBadge` menampilkan variabel loop, hasil kondisi (token success/danger), dan jumlah iterasi.
- FR-S3: `ArrayRow` menampilkan sel berindeks dan panah pointer `arr[i]`. Swap dan insert memakai `layout`/`layoutId`. Push dan pop memakai `AnimatePresence`.
- FR-S4: `BranchIndicator` menyalakan cabang `if/else` yang diambil.
- FR-S5: Panel output `console.log` yang tersinkron dengan step.
- FR-S6: `CallStack` untuk fungsi dan rekursi.
- FR-S7: Renderer adalah fungsi murni dari `trace[currentStep]`.

### 6.5 Preset dan share

- FR-X1: Preset: sum array, find max, reverse array, bubble sort, FizzBuzz 1–15. Ada tambahan preset factorial rekursif.
- FR-X2: Source di-encode base64url ke URL hash dan dimuat saat aplikasi dibuka.
- FR-X3: State kosong, error, dan step-limit memakai gaya SectionMessage.

## 7. Kebutuhan non-fungsional

| ID | Kebutuhan |
|---|---|
| NFR1 | Kode pengguna tidak pernah dievaluasi di main thread |
| NFR2 | UI tetap responsif saat kode pengguna loop tanpa henti |
| NFR3 | Semua nilai visual dari token. Tidak boleh ada hex, px spacing, atau durasi yang di-hard-code |
| NFR4 | Mendukung `prefers-reduced-motion` |
| NFR5 | Layout bekerja di lebar sempit (mobile) |
| NFR6 | Ukuran JS awal kecil dan dilaporkan lewat `dist/metafile.md` |
| NFR7 | Build satu file HTML bisa berjalan offline dengan isolasi worker tetap terjaga |
| NFR8 | Tema terang wajib. Tema gelap hanya jika varian DESIGN.md gelap tersedia |

## 8. Arsitektur

Prinsip: **trace dulu, animasi kemudian.**

```
Editor ──source──▶ runCode() ──▶ Web Worker
                                   ├─ parse (acorn)
                                   ├─ instrument (acorn-walk + astring)
                                   └─ execute + __t collector (step cap 5.000)
                       ◀── Trace (Step[]) / TraceError
Playback (currentStep) ──▶ Stage renderer (pure) ──▶ Motion diff antar step
```

Peta modul:

| Folder | Tanggung jawab |
|---|---|
| `src/tracer/` | `instrument.ts`, `runtime.ts`, `types.ts`, `run.ts`, `tracer.worker.ts`, `worker-source.ts`, test |
| `src/stage/` | `Stage.tsx`, `motion.ts` (satu-satunya sumber transition), `stage.css` |
| `src/editor/` | `CodeEditor.tsx`, wrapper CodeMirror |
| `src/playback/` | `usePlayback.ts` |
| `src/presets/` | `index.ts` |
| `src/app/` | `App.tsx`, layout, toolbar, share hash |
| `src/styles/` | `tokens.css` (hasil generate), `global.css` |
| `scripts/` | `gen-tokens.ts`, `build-single.ts`, `smoke.ts` |

## 9. Stack dan aturan dependensi

- Runtime dan tooling: Bun >= 1.4 (terpasang 1.4.2) untuk install, dev server HMR, bundling, test, YAML, dan WebView.
- Paket allowlist: `react`, `react-dom`, `@codemirror/*`, `motion`, `acorn`, `acorn-walk`, `astring`, `react-resizable-panels`, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`, dan `@types/*`.
- Paket baru di luar allowlist harus disetujui dulu dan dicatat di `docs/DEPENDENCIES.md`.
- Deviasi yang tercatat: CSS modules diganti plain CSS per komponen karena bug di HTML-route bundler Bun 1.4.2.

---

## 10. Rencana pengerjaan (work breakdown)

Setiap fase ditutup dengan `bun test`, `bun run build`, ringkasan perubahan, dan commit.

### Fase 0: Persiapan

- [x] 0.1 Pastikan `bun --version` >= 1.4 (terpasang 1.4.2).
- [x] 0.2 Simpan `MASTER_PROMPT.md` sebagai sumber spesifikasi.
- [x] 0.3 `.gitignore` mengecualikan `node_modules/` dan `dist/`.
- [ ] 0.4 Buat commit awal di branch kerja (repo saat ini belum punya commit).

### Fase 1: Scaffold

- [x] 1.1 `bun init` lalu sesuaikan dengan struktur folder.
- [x] 1.2 `server.ts` memakai `Bun.serve` dengan HTML import dan HMR.
- [x] 1.3 Script `dev`, `build`, `build:single`, `test`, `tokens`, `smoke`.
- [x] 1.4 `tsconfig.json` strict.
- [ ] 1.5 Commit: `chore: scaffold Bun app`.

### Fase 2: Tracer core

- [x] 2.1 `types.ts`: `Step`, `Event`, `Snapshot`, `Trace`, `TraceError`.
- [x] 2.2 `instrument.ts`: parse, validasi subset, sisipkan `__t`, regenerasi.
- [x] 2.3 `runtime.ts`: collector, proxy array, step limit, deep clone.
- [x] 2.4 Test: assignment, `for`, `while` + `break`, `if/else`, `push/pop`, swap, step limit, error sintaks dengan nomor baris.
- [x] 2.5 Snapshot trace untuk semua preset.
- [ ] 2.6 Commit: `feat(tracer): instrument and trace JS subset`.

### Fase 3: Worker runner

- [x] 3.1 `tracer.worker.ts` dan `runCode(source)` dengan timeout.
- [x] 3.2 Worker ter-emit di build (`dist/tracer.worker.js`).
- [x] 3.3 Main thread tetap responsif saat infinite loop.
- [ ] 3.4 Commit: `feat(tracer): run traces in a Web Worker`.

### Fase 4: UI shell

- [x] 4.1 Layout dua panel yang bisa di-resize.
- [x] 4.2 Toolbar: Run, Step back, Step forward, Play/Pause, speed, scrubber, preset picker.
- [x] 4.3 Highlight baris aktif dan error inline di editor.
- [x] 4.4 Shortcut keyboard.
- [ ] 4.5 Commit: `feat(ui): editor, toolbar and playback shell`.

### Fase 5: Design system

- [x] 5.1 Unduh `DESIGN.md` Atlassian ke root repo.
- [ ] 5.2 Coba unduh `DESIGN.short.md` ke `docs/`. Catat hasilnya (ada atau tidak) di `docs/DEPENDENCIES.md`.
- [x] 5.3 `scripts/gen-tokens.ts` menghasilkan `src/styles/tokens.css` lewat `Bun.YAML.parse`.
- [x] 5.4 Font Inter dan JetBrains Mono sebagai fallback untuk Atlassian Sans/Mono.
- [x] 5.5 Restyle ke tampilan Jira dengan recipe Button, Tab, Toggle, Lozenge, Badge, SectionMessage, dan Code.
- [x] 5.6 `src/stage/motion.ts` sebagai satu sumber transition, dan dukungan `prefers-reduced-motion`.
- [x] 5.7 `AGENTS.md` dan `CLAUDE.md`.
- [ ] 5.8 Audit: grep hex, `px`, dan `ms` yang di-hard-code di CSS/TSX selain `tokens.css`.
- [ ] 5.9 Commit: `feat(design): Atlassian tokens and Jira styling`.

### Fase 6: Stage visuals

- [x] 6.1 `VarBox`, `LoopBadge`, `ArrayRow`, `BranchIndicator`.
- [x] 6.2 Panel output console.
- [x] 6.3 `CallStack` untuk fungsi dan rekursi (melebihi MVP).
- [x] 6.4 Kecepatan Play terikat ke token durasi.
- [ ] 6.5 Commit: `feat(stage): animated stage primitives`.

### Fase 7: Preset, share, polish

- [x] 7.1 Lima preset wajib plus factorial.
- [x] 7.2 Share lewat URL hash base64url.
- [x] 7.3 State kosong, error, dan step-limit memakai SectionMessage.
- [x] 7.4 `bun run build:single` menghasilkan `dist/code-motion.html`.
- [ ] 7.5 Uji manual: buka `dist/code-motion.html` dalam kondisi offline lalu jalankan bubble sort.
- [ ] 7.6 Commit: `feat: presets, share links and single-file build`.

### Fase 8: Verifikasi

- [x] 8.1 `bun test`: 12 pass, 0 fail.
- [ ] 8.2 `bun test --parallel` hijau.
- [x] 8.3 `bun run build` sukses dan menulis `dist/metafile.md`.
- [ ] 8.4 Laporkan ukuran JS awal dari `dist/metafile.md`.
- [ ] 8.5 `bun run smoke` dijalankan ulang terhadap dev server di `localhost:3000` dan screenshot diperbarui.
- [ ] 8.6 Commit: `test: verification gate and smoke screenshots`.

### Fase 9: Rilis (pasca-MVP)

- [ ] 9.1 Push repo ke remote.
- [ ] 9.2 Pilih hosting statis (mis. GitHub Pages) untuk `dist/`.
- [ ] 9.3 Tambahkan CI yang menjalankan `bun test` dan `bun run build` di setiap PR.
- [ ] 9.4 Tag `v0.1.0`.

## 11. Kriteria penerimaan

- [x] `bun install && bun run dev` membuka aplikasi dengan HMR.
- [ ] Preset bubble sort beranimasi dari awal sampai akhir dengan Play, Step back, dan scrubber (verifikasi ulang lewat smoke test).
- [x] Infinite loop menampilkan pesan step-limit dan tab tetap responsif.
- [ ] Semua nilai visual berasal dari `tokens.css` (menunggu audit 5.8).
- [x] `docs/DEPENDENCIES.md` mencantumkan setiap paket beserta alasannya.
- [x] `AGENTS.md`, `CLAUDE.md`, dan `DESIGN.md` ada di root repo.

## 12. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Bug bundler Bun (CSS modules, worker) | Build atau dev rusak | Plain CSS per komponen; worker dibangun sebagai entrypoint sendiri; deviasi dicatat |
| Trace terlalu besar (deep clone per step) | Memori dan lag | Batas 5.000 step; pertimbangkan structural sharing |
| Subset JS membingungkan pengguna | Frustrasi | Pesan "not supported yet" dengan nomor baris; daftar fitur di README |
| `Bun.WebView` tidak tersedia di mesin lain | Smoke test gagal | Lewati smoke test dengan pesan jelas; jangan pasang Playwright tanpa persetujuan |
| Dependensi `latest` di `package.json` | Build tidak reproducible | Andalkan `bun.lock`; pertimbangkan pin versi |

## 13. Roadmap setelah MVP

1. Arrow function dan function expression.
2. Closure dan scope bersarang dengan visual environment.
3. Object literal bersarang dan visual heap dengan referensi.
4. Tema gelap, jika varian DESIGN.md gelap tersedia.
5. Ekspor video atau GIF lewat `Bun.WebView`.
6. Mode pelajaran dengan konten Markdown (`Bun.markdown`).
7. Pin versi dependensi dan pasang CI.

## 14. Definition of Done per tugas

- `bun test` dan `bun run build` hijau.
- Tidak ada nilai visual yang di-hard-code dan tidak ada dependensi baru tanpa persetujuan.
- Renderer tetap murni, dan kode pengguna hanya berjalan di worker.
- README atau `docs/` diperbarui jika perilaku berubah.
- Satu commit kecil dengan pesan yang jelas.
