# PRD — Mashpit: pasar keeper untuk kontrak NEAR

| | |
| --- | --- |
| Versi | v1 (draf), 13 Nov 2026 |
| Tim | Razaqi (smart contract + keeper agent), Bayu (frontend) |
| Hackathon | NEAR HACKATHON 2026; deadline submisi 14 Nov 2026, 23:59 UTC |
| Track | AI Swarms (utama), Open Innovation (kedua) |
| Dokumen terkait | [SMART_CONTRACT_SPEC.md](SMART_CONTRACT_SPEC.md), [FRONTEND_SPEC.md](FRONTEND_SPEC.md) |

**Cara membaca dokumen ini.** Setiap pernyataan diberi salah satu label:

- **Fakta** — bersumber; sumbernya ditautkan langsung.
- **Rancangan** — keputusan desain tim, belum dibangun.
- **Usulan** — pendapat yang menunggu keputusan tim.
- **Asumsi** — hal yang dianggap benar tapi belum diverifikasi.

---

## 0. Ringkasan

Mashpit adalah kontrak di NEAR testnet tempat agen keeper AI saling bersaing (lelang commit-reveal) untuk menjalankan tugas terjadwal milik kontrak lain, misalnya fungsi pemeliharaan per epoch di protokol liquid staking. Keeper hanya dibayar kalau eksekusinya terbukti berhasil di callback, dan pemenang lelang yang tidak mengeksekusi kena slashing.

**Nama.** *Mashpit* = **mash**ed potato + **mosh pit**: arena tempat agen AI berebut job seperti kerumunan di mosh pit, dengan aturan permainan *hot potato*. Pemenang lelang memegang job; kalau tidak segera dieksekusi sebelum jendela eksklusif habis, stake-nya "terbakar" (slashing) dan job dioper ke keeper lain (mode terbuka).

### 0.1 Usulan MVP (menunggu keputusan tim)

Waktu tersisa saat dokumen ditulis: sekitar 36 jam (13 Nov 11:15 UTC sampai 14 Nov 23:59 UTC), dengan 2 orang. Usulan pembagian:

| Prioritas | Fitur | Alasan |
| --- | --- | --- |
| **P0 (wajib untuk demo)** | Kontrak: registrasi keeper + stake, registrasi job, lelang commit-reveal per eksekusi, eksekusi lewat cross-contract call + callback, pembayaran reward − fee, mode terbuka saat tidak ada tawaran | Inti produk; tanpa ini tidak ada demo |
| P0 | Keeper agent (minimal 3 instance, sub-account berbeda) dengan keputusan tawaran oleh model AI + aturan cadangan | Unsur "AI" dan "swarm" untuk track AI Swarms |
| P0 | Dashboard live (baca-saja): job, fase lelang, tawaran + alasan AI, riwayat eksekusi | Wow moment; dilihat juri |
| P0 | Job demo nyata: `epoch_update_rewards` di `linear-protocol.testnet` | Job nyata dari protokol yang ada, bukan buatan tim |
| **P1 (sebaiknya)** | Slashing pemenang yang melewatkan eksekusi + pembukaan slot ke keeper lain | Skenario failover di demo |
| P1 | Form "Buat job" dengan wallet (NEAR Connect) | Juri bisa mencoba sendiri |
| P1 | Job tambahan: `ping` staking pool testnet; `epoch_stake` LiNEAR dengan aturan "harus mengembalikan `true`" | Memperlihatkan verifikasi hasil |
| **Di luar MVP** | Pembayaran lewat NEAR Intents, reward token NEP-141, opsi AI 2 (bahasa alami → job), lelang untuk N > 1 eksekusi, mainnet, reputasi keeper, audit | Lihat §3.2 |

**Keputusan yang dibutuhkan** ada di §12. Keeper agent dikerjakan Razaqi (keputusan tim, 13 Nov).

---

## 1. Tujuan dan Latar Belakang

### 1.1 Latar belakang / problem statement

**Fakta:**

1. "Smart contracts cannot execute automatically; they must be called by an external account" ([docs.near.org](https://docs.near.org/smart-contracts/what-is)). Yield/resume hanya bisa menunggu sampai 200 blok ([docs](https://docs.near.org/smart-contracts/anatomy/yield-resume)).
2. Di hackathon ini, minimal **22 dari 454 repo peserta** yang dipindai membangun keeper atau bot sendiri yang mengirim transaksi ke kontrak NEAR. Minimal 7 memakai GitHub Actions terjadwal, minimal 3 memakai proses yang berjalan terus. Metode: pemindaian repo GitHub publik yang ditautkan peserta (13 Nov 2026), lalu pemeriksaan manual baris kode yang mengirim transaksi. Contoh: [Trueque](https://github.com/jafetchvdev/trueque), [Tenor](https://github.com/avishrakshe/Tenor), [FlashFirm](https://github.com/0xcaptain888/flashfirm), [Slay the Bear](https://github.com/vibe-code-guy/slay-the-bear), [NEAR Books](https://github.com/IhorMuliar/nearbooks), [Auvora](https://github.com/arsenicbreaker/auvorafinance).
3. Protokol liquid staking membutuhkan pemanggilan berkala oleh pihak luar:
   - LiNEAR: "This function is expected to be called in each epoch" dan "Actions that should be called by off-chain actors" ([epoch_actions.rs](https://github.com/linear-protocol/LiNEAR/blob/main/contracts/linear/src/epoch_actions.rs)). Di mainnet, 100 transaksi terakhir ke `linear-protocol.near` (13 Nov 06:11–09:09 UTC) semuanya `epoch_*` dari **satu akun**, `governorlin.near` (data dari [NearBlocks API v3](https://api.nearblocks.io/api-docs/migration), endpoint `/v3/accounts/linear-protocol.near/txns`).
   - Meta Pool: `distribute_rewards` "Should be called once per epoch per sp"; README-nya mencantumkan to-do "External cron to call distribute()" ([repo](https://github.com/Meta-Pool/liquid-staking-contract)).
   - Docs NEAR Node: "A ping should be issued each epoch to keep reported rewards current on the pool contract." ([near-nodes.io](https://near-nodes.io/validator/compile-and-run-a-node)). Di mainnet banyak pihak memanggil `ping` sendiri-sendiri, kadang pada menit yang sama; contohnya di `peerfolio.pool.near`, akun `watcher07.ref-watchdog.near` dan `watcher08.ref-watchdog.near` memanggil pada menit yang sama (NearBlocks API v3, 13 Nov 2026).
4. Fungsi-fungsi di atas bisa dipanggil siapa saja, tapi **pemanggilnya tidak diberi imbalan** oleh kontrak (LiNEAR, Meta Pool, staking pool).
5. Alternatif yang dipakai developer, GitHub Actions terjadwal, punya batasan resmi: interval minimal 5 menit; jadwal "can be delayed" dan "some queued jobs may be dropped" saat beban tinggi; nonaktif otomatis di repo publik setelah 60 hari tanpa aktivitas ([docs GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). Satu tim hackathon menulis: "GitHub's scheduler skips many of that job's slots" ([Code Blue](https://github.com/0xNoramiya/rosc)).
6. Preseden: CronCat (awalnya "Cron.near", didanai grant NEAR Foundation 2021) pernah membangun scheduler untuk NEAR. Aktivitas organisasinya terakhir 26 Des 2023 ([forum](https://gov.near.org/t/cron-near-grantee-update-1-mar-27/1046), [repo](https://github.com/Cron-Near/contracts)).

**Kenapa penting (disimpulkan dari fakta di atas):** setiap tim dan protokol membangun dan merawat keeper sendiri, sering bergantung pada satu akun atau satu layanan terjadwal yang bisa terlewat. Tidak ada insentif on-chain bagi pihak lain untuk menggantikan.

### 1.2 Tujuan

**Tujuan hackathon (usulan, terukur):**

| # | Tujuan | Ukuran |
| --- | --- | --- |
| O1 | Membuktikan job nyata bisa dijalankan oleh jaringan keeper terbuka | Minimal 1 job `epoch_*` LiNEAR testnet tereksekusi lewat Mashpit, tercatat on-chain |
| O2 | Membuktikan pasar antar-agen berjalan | Minimal 3 keeper terdaftar; minimal 1 lelang dengan ≥ 2 tawaran yang di-reveal, beserta alasan AI |
| O3 | Membuktikan ketahanan | Minimal 1 failover: pemenang tidak mengeksekusi, kena slash, keeper lain mengeksekusi (P1) |
| O4 | Lolos screening AI dan bisa direproduksi | README dengan langkah "do X - see Y" yang bisa diikuti dari repo publik (HACKATHON.md, Q-017) |
| O5 | Demo tetap hidup | Kontrak + keeper + dashboard berjalan sampai 18 Nov, idealnya 25 Nov (Q-012) |

**Tujuan produk (setelah hackathon, usulan):** menjadi lapisan eksekusi terjadwal yang terbuka untuk protokol NEAR, menggantikan bot satu-akun dan cron pribadi.

---

## 2. Sasaran Pengguna & Kebutuhan

### 2.1 Persona

| Persona | Siapa (contoh nyata) | Kebutuhan | Fakta pendukung |
| --- | --- | --- | --- |
| **P1. Operator protokol** | Tim protokol liquid staking (LiNEAR, Meta Pool) | Fungsi pemeliharaan per epoch tetap jalan tanpa bergantung pada satu bot | Fungsi `epoch_*`/`distribute_*` terbuka untuk siapa saja; di mainnet LiNEAR dijalankan satu akun |
| **P2. Developer dApp** | Tim seperti Auvora, LastKey Bunker, Slay the Bear | Eksekusi berkala yang andal tanpa merawat server/cron sendiri | Auvora: keeper sendiri, tanpa imbalan; LastKey: warisan via GitHub Actions; Slay the Bear: perlu eksekusi 15 detik setelah beacon |
| **P3. Operator keeper** | Siapa saja dengan sedikit NEAR untuk stake dan gas | Mendapat reward dari menjalankan job | Rancangan; belum ada bukti minat |
| **P4. Juri / pengamat** | Juri hackathon, komunitas | Melihat pasar keeper bekerja secara transparan | Dashboard live (rancangan) |

Persona utama untuk pitch adalah **keputusan tim** (§12). Usulan: P1, karena buktinya paling kuat (kontrak protokol nyata, data on-chain mainnet).

### 2.2 User story

**Pemilik job (P1, P2):**

- US-1. Sebagai pemilik job, saya ingin mendaftarkan panggilan kontrak (kontrak target, method, argumen, gas) dengan jadwal per epoch atau per N blok, agar dijalankan tanpa server saya sendiri.
- US-2. Sebagai pemilik job, saya ingin menetapkan `max_reward` per eksekusi, agar biaya saya terbatas.
- US-3. Sebagai pemilik job, saya ingin hanya membayar eksekusi yang berhasil (dan, kalau saya pilih, yang mengembalikan `true`), agar tidak membayar pekerjaan sia-sia.
- US-4. Sebagai pemilik job, saya ingin dikompensasi kalau keeper pemenang lalai, agar risiko keterlambatan tidak sepenuhnya saya tanggung.
- US-5. Sebagai pemilik job, saya ingin menambah saldo, menjeda, atau menutup job dan menarik sisa saldo.

**Keeper (P3):**

- US-6. Sebagai keeper, saya ingin mendaftar dengan stake dari sub-account, agar bisa ikut lelang.
- US-7. Sebagai keeper, saya ingin agen AI saya menilai job dan menentukan tawaran, agar tidak rugi karena gas dan biaya inferensi.
- US-8. Sebagai keeper, saya ingin menarik reward yang terkumpul dan stake yang tidak terkunci.

**Pengamat (P4):**

- US-9. Sebagai pengamat, saya ingin melihat job, fase lelang, tawaran beserta alasan AI, dan hasil eksekusi secara live, tanpa login.

---

## 3. Ruang Lingkup

### 3.1 In-scope (MVP, mengikuti §0.1)

- Kontrak `mashpit` di NEAR **testnet** (Q-010: proyek testnet-only eligible).
- Jadwal: `EveryEpoch` dan `EveryBlocks(n)`.
- Aturan sukses: `Any` (callback sukses) atau `ReturnsTrue` (callback sukses dan nilai kembalian `true`).
- Lelang commit-reveal untuk **satu eksekusi berikutnya** (N = 1).
- Reward dan stake dalam **NEAR native**.
- Fee protokol (default usulan 5%).
- Slashing pemenang yang melewatkan batas waktu (P1).
- Keeper agent TypeScript dengan keputusan tawaran oleh model NEAR AI Cloud, dan aturan cadangan deterministik kalau model gagal.
- Dashboard web statis yang membaca kontrak lewat RPC; form buat job dengan NEAR Connect (P1).
- Job demo: `epoch_update_rewards` LiNEAR testnet (P0), `ping` staking pool testnet dan `epoch_stake` LiNEAR (P1).

### 3.2 Out-of-scope

| Fitur | Alasan |
| --- | --- |
| Pembayaran/settlement lewat NEAR Intents | Intents tidak punya testnet (Q-007); hint track, bukan syarat (Q-011) |
| Reward dalam token NEP-141 / stablecoin | Menambah kompleksitas kontrak |
| Opsi AI 2 (bahasa alami → spesifikasi job) | Keputusan tim 13 Nov: opsi 1 dulu |
| Lelang untuk N > 1 eksekusi sekaligus | Disederhanakan untuk MVP |
| Jadwal berbasis waktu kalender (cron string) | `EveryEpoch`/`EveryBlocks` cukup untuk job demo |
| Job yang melampirkan deposit ke kontrak target | MVP hanya mendukung `attached_deposit = 0` |
| Reputasi keeper, `max_reward` dinamis | Pasca-hackathon |
| Deploy mainnet, audit | Pasca-hackathon |
| Deteksi "pihak lain sudah memanggil duluan" untuk job tanpa nilai kembalian | `ping` tidak mengembalikan nilai dan tidak ada view method untuk `last_epoch_height` ([staking-pool](https://github.com/near/core-contracts/tree/master/staking-pool)), jadi kontrak lain tidak bisa membacanya |

---

## 4. Persyaratan

### 4.1 Functional requirements

Detail method, struktur data, dan error ada di [SMART_CONTRACT_SPEC.md](SMART_CONTRACT_SPEC.md); detail tampilan ada di [FRONTEND_SPEC.md](FRONTEND_SPEC.md).

**Kontrak (`mashpit`)**

| ID | Requirement | Prioritas |
| --- | --- | --- |
| FR-C1 | Keeper mendaftar dengan stake (attached deposit ≥ `min_keeper_stake`), menambah stake, menarik stake bebas, dan menarik reward | P0 |
| FR-C2 | Pemilik job mendaftarkan job: target, method, args (base64), gas (Tgas), jadwal, aturan sukses, `max_reward`, saldo awal. Deposit harus menutup saldo + biaya storage | P0 |
| FR-C3 | Setiap job punya satu putaran (round) aktif untuk eksekusi berikutnya: fase commit → reveal → pemenang → jendela eksklusif → mode terbuka | P0 |
| FR-C4 | Commit: keeper menyimpan hash tawaran + jaminan; syarat stake bebas ≥ `stake_multiplier × max_reward` | P0 |
| FR-C5 | Reveal: tawaran ≤ `max_reward` dan cocok dengan hash; boleh menyertakan `memo` (alasan AI, dibatasi panjangnya). Jaminan keeper yang tidak reveal hangus ke saldo job | P0 |
| FR-C6 | Penentuan pemenang deterministik: tawaran terendah → commit di blok lebih awal → nama akun lebih kecil | P0 |
| FR-C7 | `execute`: hanya pemenang selama jendela eksklusif; keeper terdaftar mana pun di mode terbuka. Eksekusi lewat cross-contract call + callback | P0 |
| FR-C8 | Callback: bayar reward (tawaran, atau `max_reward` di mode terbuka) dikurangi fee hanya kalau aturan sukses terpenuhi; perbarui jadwal; buka putaran berikutnya | P0 |
| FR-C9 | Job `EveryEpoch` dibayar paling banyak sekali per epoch | P0 |
| FR-C10 | `slash_missed`: siapa saja bisa memicu slashing kalau jendela eksklusif lewat tanpa eksekusi; kompensasi ke saldo job; putaran pindah ke mode terbuka | P1 |
| FR-C11 | Pemilik job: tambah saldo, jeda/lanjutkan, tutup job dan tarik sisa saldo | P0 (tambah saldo, tutup) / P1 (jeda) |
| FR-C12 | View method untuk semua data yang ditampilkan dashboard, termasuk riwayat eksekusi terakhir per job (dibatasi jumlahnya) | P0 |
| FR-C13 | Log event untuk setiap perubahan penting (commit, reveal, winner, executed, slashed) | P1 |

**Keeper agent**

| ID | Requirement | Prioritas |
| --- | --- | --- |
| FR-K1 | Berjalan terus; membaca job dan putaran aktif lewat RPC view | P0 |
| FR-K2 | Untuk setiap putaran baru, meminta keputusan ke model AI (ikut/tidak, tawaran, alasan singkat) dengan input: `max_reward`, perkiraan biaya gas, riwayat eksekusi job | P0 |
| FR-K3 | Kalau model gagal atau terlambat, memakai aturan cadangan deterministik (misalnya tawaran = biaya gas × faktor margin) | P0 |
| FR-K4 | Mengirim commit dan reveal pada fase yang benar; menyimpan salt secara lokal sampai reveal | P0 |
| FR-K5 | Kalau menang, mengeksekusi saat job jatuh tempo; kalau ada slot terbuka, ikut mengeksekusi | P0 |
| FR-K6 | Memicu `slash_missed` kalau menemukan pemenang yang lalai | P1 |
| FR-K7 | Kunci akun keeper dan API key AI dibaca dari variabel lingkungan, tidak pernah di-commit | P0 |

**Dashboard (web)**

| ID | Requirement | Prioritas |
| --- | --- | --- |
| FR-W1 | Halaman Live: daftar job, status, fase putaran, hitung mundur dalam blok, eksekusi terakhir | P0 |
| FR-W2 | Halaman detail job: parameter, saldo, tawaran yang sudah di-reveal beserta alasan AI, riwayat eksekusi, event slash | P0 |
| FR-W3 | Halaman keeper: stake, stake terkunci, jumlah eksekusi, slash, reward | P0 |
| FR-W4 | Login wallet dengan NEAR Connect; form buat job dengan template (LiNEAR `epoch_update_rewards`, staking pool `ping`) | P1 |
| FR-W5 | Aksi pemilik job: tambah saldo, tutup job | P1 |

### 4.2 Non-functional requirements

| ID | Requirement | Dasar |
| --- | --- | --- |
| NFR-1 | Total gas per transaksi `execute` (gas target + callback + overhead) ≤ 300 Tgas | Docs NEAR berbeda soal batas prepaid gas (300 Tgas di halaman environment, 1.000 Tgas di halaman gas); 300 Tgas dipilih sebagai batas aman |
| NFR-2 | Storage yang dibuat oleh pengguna dibayar oleh pengguna (deposit ≥ pertambahan storage × 1E19 yoctoNEAR/byte) | [Docs storage staking](https://docs.near.org/protocol/storage/storage-staking) |
| NFR-3 | Data yang tumbuh tak terbatas dibatasi (riwayat per job maks N entri; memo maks M byte) | Turunan NFR-2 |
| NFR-4 | Tidak ada private key atau API key di repo atau riwayat git | HACKATHON.md (aturan secrets); checklist [SUBMITTING.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/SUBMITTING.md) di repo prompt contoh |
| NFR-5 | Dashboard memperbarui data dalam ≤ 5 detik (polling RPC) | Waktu blok terukur ~0,58 detik; usulan |
| NFR-6 | Dashboard bisa diakses tanpa login dan berjalan sebagai situs statis | Q-009 (RPC publik gratis); Q-012 (hosted demo nilai plus) |
| NFR-7 | Keeper referensi berjalan di minimal 2–3 mesin/proses terpisah dan tetap hidup sampai 18 Nov (ideal 25 Nov) | Q-012; desain failover |
| NFR-8 | Kontrak dan keeper bisa direproduksi dari README (build, deploy, jalankan) | Q-017 (screening reproduksibilitas) |
| NFR-9 | Dashboard responsif di layar desktop dan ponsel | Usulan |
| NFR-10 | Semua library dan template yang dipakai dicantumkan di README; ada file LICENSE | Q-005, Q-014 |

---

## 5. Alur Pengguna dan Desain

### 5.1 Alur utama (satu eksekusi)

```
Pemilik job           Kontrak mashpit                    Keeper A / B / C (agen AI)          Kontrak target
    |                       |                                       |                                  |
    |-- register_job ------>| buat job + putaran #1 (commit)        |                                  |
    |                       |<---- commit_bid(hash, jaminan) -------| (A, B, C; keputusan dari AI)     |
    |                       |  ...fase commit selesai...            |                                  |
    |                       |<---- reveal_bid(tawaran, salt, memo) -| (A, B, C)                        |
    |                       |  ...fase reveal selesai...            |                                  |
    |                       |  pemenang = tawaran terendah (mis. B) |                                  |
    |                       |  ...job jatuh tempo...                |                                  |
    |                       |<---- execute(job) --------------------| (B, dalam jendela eksklusif)     |
    |                       |-------------------- function_call ------------------------------------->|
    |                       |<------------------- hasil (sukses/gagal, nilai kembalian) --------------|
    |                       | callback: bayar B (tawaran − fee),    |                                  |
    |                       | catat riwayat, buka putaran #2        |                                  |
```

### 5.2 Alur failover (P1)

```
Pemenang B tidak mengeksekusi sampai batas jendela eksklusif
  -> siapa saja memanggil slash_missed(job)
  -> stake B dipotong max_reward, masuk ke saldo job
  -> putaran masuk mode terbuka
  -> keeper A memanggil execute(job), dibayar max_reward − fee kalau sukses
```

### 5.3 Status putaran

```
Commit --(commit_end)--> Reveal --(reveal_end)--> [ada pemenang?]
                                                    ├─ ya  --> Awarded --(jatuh tempo)--> Exclusive --(eksekusi sukses)--> Settled
                                                    │                                         └─(lewat batas, slash_missed)--> Open
                                                    └─ tidak --> Open --(eksekusi sukses)--> Settled
Settled --> putaran baru (Commit)
```

### 5.4 Wireframe

Wireframe kasar per halaman ada di [FRONTEND_SPEC.md §4](FRONTEND_SPEC.md#4-wireframe).

---

## 6. Kriteria Keberhasilan & Rilis

### 6.1 Acceptance criteria (MVP)

| ID | Kriteria | Cara uji |
| --- | --- | --- |
| AC-1 | Keeper bisa register, commit, reveal; hash yang tidak cocok ditolak | Unit test kontrak + transaksi testnet |
| AC-2 | Pemenang sesuai aturan seri (tawaran → blok commit → nama akun) | Unit test dengan tawaran sama |
| AC-3 | `execute` oleh non-pemenang ditolak selama jendela eksklusif, diterima di mode terbuka | Unit test + integration test (near-workspaces) |
| AC-4 | Callback gagal (target panic) → tidak ada pembayaran, putaran tidak hilang | Integration test dengan kontrak target dummy yang panic |
| AC-5 | Aturan `ReturnsTrue`: nilai `false` → tidak dibayar | Integration test |
| AC-6 | Job `EveryEpoch` tidak bisa dibayar dua kali di epoch yang sama | Unit test |
| AC-7 | `slash_missed` memotong stake pemenang dan membuka mode terbuka (P1) | Integration test |
| AC-8 | Satu eksekusi `epoch_update_rewards` di `linear-protocol.testnet` lewat Mashpit sukses dan terlihat di dashboard | Uji manual di testnet |
| AC-9 | Dashboard menampilkan fase putaran, tawaran + memo, dan riwayat eksekusi tanpa login | Uji manual |
| AC-10 | README: dari clone repo sampai melihat eksekusi di dashboard dengan langkah "do X - see Y" | Diuji oleh anggota tim yang tidak menulis bagian itu |

### 6.2 Release criteria (submisi hackathon)

Dari [HACKATHON.md](../HACKATHON.md) (aturan resmi) dan checklist [SUBMITTING.md](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/SUBMITTING.md) di repo prompt contoh `nearai/near-hackathon-prompt-examples`. Repo prompt contoh itu disebut HACKATHON.md sebagai "a starting point, not a requirement"; isi checklist-nya sejalan dengan aturan resmi:

- [ ] Repo publik sebelum 2026-11-14T23:59:00Z, dengan LICENSE.
- [ ] README untuk pembaca mesin dan manusia: apa produknya, masalahnya, langkah "do X - see Y". Tanpa bahasa marketing.
- [ ] Demo post di X: menyebut dibangun di NEAR HACKATHON, tag @NEARProtocol dan #NEARHackathon, dengan video. Dibuka dengan masalah pengguna, satu momen lengkap, peran NEAR secara konkret, dan satu pertanyaan.
- [ ] Akun NEAR mainnet untuk pembayaran hadiah.
- [ ] Tracks: `swarms`, `open`.
- [ ] Tidak ada secret di riwayat git.
- [ ] Payload submisi ditinjau manusia sebelum dikirim; satu repo hanya bisa disubmit sekali.

### 6.3 Metrik & pelacakan

Semua metrik dibaca dari view method kontrak (tanpa backend analitik):

| Metrik | Sumber |
| --- | --- |
| Jumlah job aktif, eksekusi sukses/gagal per job | `get_job`, riwayat eksekusi |
| Jumlah keeper terdaftar, stake total | `list_keepers` |
| Jumlah tawaran per putaran, harga hasil lelang vs `max_reward` | Data putaran |
| Jumlah slash dan failover | Riwayat eksekusi / event |
| Selisih blok antara jatuh tempo dan eksekusi | Riwayat eksekusi (blok jatuh tempo vs blok eksekusi) |
| Fee protokol terkumpul | `get_config` / saldo treasury |

---

## 7. Asumsi, Risiko, dan Ketergantungan

### 7.1 Asumsi & batasan

| # | Asumsi / batasan | Status |
| --- | --- | --- |
| A1 | Kontrak `linear-protocol.testnet` tetap aktif (`is_paused: false`) selama demo | Fakta per 13 Nov; bisa berubah |
| A2 | `epoch_update_rewards` LiNEAR bisa dipanggil oleh akun mana pun, termasuk kontrak `mashpit` | Fakta dari kode (hanya `assert_running` + cek gas); belum diuji lewat panggilan antar-kontrak |
| A3 | Menjalankan fungsi publik di kontrak testnet pihak lain untuk demo bisa diterima | Asumsi; dipertimbangkan tim |
| A4 | Latensi model AI cukup kecil untuk fase commit 50 blok (~29 detik) | Asumsi; belum diukur |
| A5 | Tim punya akses NEAR AI Cloud (kredit $10 via NEAR Builders, Q-000) | Asumsi |
| A6 | Batas gas aman 300 Tgas cukup: `epoch_update_rewards` butuh ≥ 125 Tgas (75 + 25 + 25, dari konstanta LiNEAR) | Fakta (konstanta); total dengan overhead belum diukur |
| A7 | Testnet NEAR gratis lewat faucet (Q-008) | Fakta |

### 7.2 Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Waktu tidak cukup (±36 jam, 2 orang) | Demo tidak lengkap | Kerjakan P0 dulu; P1 hanya kalau P0 selesai; slashing bisa ditunjukkan lewat unit test kalau tidak sempat di testnet |
| Beban kerja Razaqi besar (kontrak + keeper agent) | Keeper agent atau slashing tidak selesai | Kerjakan keeper dengan aturan cadangan deterministik dulu, baru tambahkan keputusan AI; P1 kontrak dikerjakan setelah keeper P0 jalan; Bayu membantu bagian keeper berbasis TypeScript kalau dashboard P0 selesai lebih cepat |
| Callback/gas salah hitung → eksekusi gagal | Job demo gagal | Integration test dengan near-workspaces; uji di testnet sebelum demo |
| Model AI lambat/gagal | Keeper melewatkan fase commit | Aturan cadangan deterministik (FR-K3) |
| `epoch_update_rewards` tidak berguna kalau sudah dipanggil pihak lain di epoch itu | Eksekusi "sia-sia" tetap dibayar (fungsi tidak mengembalikan nilai) | Diakui sebagai keterbatasan; demo `epoch_stake` dengan `ReturnsTrue` (P1) sebagai pembanding |
| `epoch_stake` testnet mengembalikan `false` karena tidak ada stake baru | Demo `ReturnsTrue` tidak menunjukkan pembayaran | Deposit ≥ 1 NEAR ke LiNEAR testnet sebelum demo (`MIN_AMOUNT_TO_PERFORM_STAKE = ONE_NEAR`) |
| Juri bertanya "kenapa tidak GitHub Actions?" | Nilai produk dipertanyakan | Siapkan perbandingan berdasarkan batasan resmi GitHub Actions (§1.1 butir 5) dan contoh [LastKey Bunker](https://github.com/mastrophot/lastkey-bunker), [Code Blue](https://github.com/0xNoramiya/rosc), [Slay the Bear](https://github.com/vibe-code-guy/slay-the-bear) |
| Juri menganggap unsur AI kurang | Kecocokan track AI Swarms | Tampilkan alasan AI per tawaran di dashboard; opsional tanya panitia |
| Keeper berkolusi / sedikit | Lelang tidak menurunkan harga | Batas `max_reward`; pemilik job bisa menjadi keeper sendiri; diakui sebagai keterbatasan |

### 7.3 Ketergantungan

| Ketergantungan | Untuk | Catatan |
| --- | --- | --- |
| NEAR testnet + RPC publik | Semua | Q-009 |
| `linear-protocol.testnet` (pihak ketiga) | Job demo utama | 5 validator testnet: `bee1stake`, `chorusone`, `aurora`, `01node`, `everstake` (`*.pool.f863973.m0`) |
| Staking pool testnet (mis. `aurora.pool.f863973.m0`) | Job demo `ping` (P1) | |
| NEAR AI Cloud (`https://cloud-api.near.ai/v1`, OpenAI-compatible) | Keputusan tawaran keeper | Harga model publik di `/v1/models` |
| near-sdk 5.30.1, cargo-near 0.23.0, near-workspaces 0.24.0 | Kontrak dan test | Versi terbaru di crates.io per 13 Nov |
| near-api-js 7.5.3, @hot-labs/near-connect 0.12.0 | Keeper dan dashboard | Docs NEAR: Wallet Selector deprecated, pakai NEAR Connect |
| Hosting statis + mesin untuk keeper | Demo hidup sampai 18–25 Nov | Belum dipilih (§12) |

---

## 8. Arsitektur

```
                        ┌───────────────────────────── NEAR testnet ─────────────────────────────┐
                        │                                                                         │
 Pemilik job ──wallet──▶│  mashpit.<akun>.testnet  ──function_call──▶  linear-protocol.testnet    │
 (dashboard)            │   - registry job                              aurora.pool.f863973.m0     │
                        │   - lelang commit-reveal  ◀──callback─────    kontrak target lain        │
                        │   - stake/slash/reward                                                    │
                        └──────────▲──────────────────────────▲──────────────────────────────────┘
                                   │ RPC (view + tx)          │ RPC (view saja)
              ┌────────────────────┴───────────┐     ┌────────┴─────────────────┐
              │ Keeper agent × 3 (server)       │     │ Dashboard (situs statis) │
              │ k1/k2/k3.<akun>.testnet         │     │ baca view method          │
              │ ── NEAR AI Cloud (keputusan) ── │     │ NEAR Connect untuk form   │
              └─────────────────────────────────┘     └──────────────────────────┘
```

- Kontrak: Rust, near-sdk 5.x, dibangun dengan cargo-near.
- Keeper: TypeScript (Node), near-api-js; proses berjalan terus.
- Dashboard: TypeScript, situs statis; membaca kontrak lewat RPC publik.
- Tidak ada database atau API pusat milik tim. Server hanya menjalankan proses keeper, karena kontrak tidak bisa berjalan sendiri (§1.1 butir 1).

---

## 9. Struktur folder (rancangan)

```
Mashpit/
├── README.md                       # "do X - see Y" untuk juri (Q-017)
├── LICENSE                         # MIT (Q-014)
├── HACKATHON.md                    # salinan aturan resmi
├── .gitignore                      # .env, target/, node_modules/, keeper state
├── docs/
│   ├── PRD.md
│   ├── SMART_CONTRACT_SPEC.md
│   ├── FRONTEND_SPEC.md
│   └── RULES.md                    # aturan lelang ringkas (saran prompt contoh Swarms)
├── contracts/
│   └── mashpit/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs              # state + init + admin
│       │   ├── types.rs            # Job, Round, Keeper, Schedule, SuccessRule, Config
│       │   ├── keeper.rs           # register/stake/withdraw
│       │   ├── job.rs              # register/top_up/pause/close
│       │   ├── auction.rs          # commit/reveal/finalize, aturan seri
│       │   ├── execute.rs          # execute, callback, slash_missed
│       │   ├── views.rs            # view method untuk dashboard
│       │   └── events.rs           # log event
│       └── tests/                  # near-workspaces integration tests
│           ├── auction.rs
│           ├── execute.rs
│           └── mock_target/        # kontrak dummy: sukses, panic, return bool
├── keeper/
│   ├── package.json
│   ├── .env.example                # KEEPER_ACCOUNT_ID, KEEPER_PRIVATE_KEY, NEAR_AI_API_KEY, ...
│   └── src/
│       ├── index.ts                # loop utama
│       ├── near.ts                 # RPC + kirim transaksi
│       ├── auction.ts              # commit/reveal, simpan salt
│       ├── ai.ts                   # panggil NEAR AI Cloud, parse keputusan
│       ├── fallback.ts             # aturan cadangan deterministik
│       └── config.ts
├── web/
│   ├── package.json
│   ├── .env.example                # VITE_CONTRACT_ID, VITE_NETWORK, VITE_RPC_URL
│   └── src/                        # detail di FRONTEND_SPEC.md §6
└── scripts/
    ├── deploy.sh                   # build + deploy + init kontrak
    ├── create-keepers.sh           # buat sub-account k1..k3 + register
    └── seed-jobs.sh                # daftarkan job demo (LiNEAR, ping)
```

---

## 10. Rencana kerja dan pembagian tim (usulan)

| Waktu (UTC) | Razaqi (smart contract + keeper agent) | Bayu (frontend) |
| --- | --- | --- |
| 13 Nov, s/d 15:00 | Skeleton kontrak, types, registry keeper + job; deploy versi awal dengan view method secepatnya | Skeleton web, koneksi RPC, uji koneksi dengan view LiNEAR testnet |
| 13 Nov, 15:00–24:00 | Lelang commit-reveal, execute + callback, unit test | Halaman Live, detail job, keeper (memakai bentuk view dari spec) |
| 14 Nov, 00:00–06:00 | Integration test (mock target), deploy testnet, `create-keepers`, `seed-jobs` | Hubungkan ke kontrak testnet; form buat job (P1) |
| 14 Nov, 06:00–14:00 | Keeper agent: commit/reveal/execute dengan aturan cadangan, lalu keputusan AI; 3 keeper berjalan di Railway | Tampilan memo AI, riwayat, failover; polish |
| 14 Nov, 14:00–19:00 | Slashing (P1), uji failover, job `ping` + `epoch_stake` (P1) | Bantu keeper kalau dashboard P0 selesai; README bagian web |
| 14 Nov, 19:00–23:00 | README bagian kontrak + keeper, rekam demo | Rekam demo, post X | 
| 14 Nov, 23:00–23:59 | Submisi (payload ditinjau berdua), buffer | |

---

## 11. Demo (rancangan)

1. Dashboard menampilkan job `epoch_update_rewards` untuk satu validator LiNEAR testnet.
2. Putaran baru: tiga keeper melakukan commit, lalu reveal; dashboard menampilkan tawaran dan alasan AI masing-masing.
3. Pemenang mengeksekusi saat jatuh tempo; dashboard menampilkan hasil callback dan pembayaran.
4. (P1) Keeper pemenang dimatikan; batas jendela lewat; `slash_missed` dipanggil; keeper lain mengeksekusi.
5. Penutup: data mainnet bahwa fungsi yang sama di `linear-protocol.near` dijalankan oleh satu akun saja.

---

## 12. Keputusan yang dibutuhkan

| # | Keputusan | Usulan |
| --- | --- | --- |
| D1 | Siapa membangun keeper agent (TypeScript + NEAR AI)? | **Diputuskan 13 Nov: Razaqi** |
| D2 | Setuju dengan batas MVP §0.1? | — |
| D3 | Persona utama untuk pitch | P1 (operator protokol liquid staking) |
| D4 | Framework web | Vite + React + TypeScript (situs statis). Keputusan Bayu |
| D5 | Hosting dashboard dan mesin keeper | Belum dipilih |
| D6 | Angka: fee protokol, `min_keeper_stake`, batas bawah jaminan commit, `stake_multiplier` | Default usulan di SMART_CONTRACT_SPEC §3 |
| D7 | Model AI untuk keeper | Pilih dari `/v1/models` setelah latensi diukur; kandidat termurah: `z-ai/glm-5.3-flash`, `openai/gpt-6-luna` |
| D8 | Apakah memberi tahu tim LiNEAR sebelum memakai kontrak testnet mereka untuk demo | Keputusan tim |

---

## 13. Referensi

- Data submisi hackathon: API resmi `https://nearhackathon.com/api/projects` (dipakai halaman [nearhackathon.com](https://nearhackathon.com/))
- Data on-chain: RPC publik NEAR dan [NearBlocks API v3](https://api.nearblocks.io/api-docs/migration)
- GitHub Actions: [schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [disabling workflows](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow)
- Liquid staking: [LiNEAR](https://github.com/linear-protocol/LiNEAR), [Meta Pool](https://github.com/Meta-Pool/liquid-staking-contract); staking pool: [near/core-contracts](https://github.com/near/core-contracts/tree/master/staking-pool)
- Preseden: [Cron-Near/contracts](https://github.com/Cron-Near/contracts), [forum grant Cron.near](https://gov.near.org/t/cron-near-grantee-update-1-mar-27/1046)
- Aturan hackathon: [../HACKATHON.md](../HACKATHON.md), [prompt contoh Swarms](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/05-swarms.md)
- NEAR docs: [cross-contract](https://docs.near.org/smart-contracts/anatomy/crosscontract), [storage staking](https://docs.near.org/protocol/storage/storage-staking), [gas](https://docs.near.org/protocol/transactions/gas), [random](https://docs.near.org/smart-contracts/security/random), [wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login)
- LiNEAR: [repo](https://github.com/linear-protocol/LiNEAR)
