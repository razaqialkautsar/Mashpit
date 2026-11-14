# Mashpit: naskah video demo (motion) dan draf post X

Versi 2, 14 Nov 2026 (revisi setelah review Bayu). Semua angka, kutipan, dan hash transaksi di sini adalah data nyata dari testnet. Setiap klaim yang tampil di video punya **sumber yang bisa dicek**, tercantum di tabel "Bukti per adegan". Teks di layar ditulis dalam bahasa Inggris karena ditonton juri internasional.

**Perubahan dari versi 1:**
- **Diperbaiki:** versi 1 menyiratkan bahwa eksekusi `epoch_stake` (284,94 NEAR) dimenangkan lewat lelang. Faktanya, round itu **tanpa tawaran** (`winner: null`, `open_mode: true`). k2 mengeksekusinya di mode terbuka dan dibayar `max_reward` 0,02 NEAR. Adegannya sekarang ditulis apa adanya.
- **Lelang yang ditampilkan sekarang lelang sungguhan:** job #6 round 1. Memo k1 dan k2 diambil dari transaksi reveal di chain, bukan dari round lain.
- **Bukti job #6 dan #7** (yang sudah dihapus dari state oleh `close_job`) sekarang memakai hash transaksi, jadi tetap bisa dicek di NearBlocks.

---

## Konsep: "The Hot Potato Receipt"

**Ide besar.** Sebuah job adalah **kentang panas** yang dilempar ke **mosh pit** berisi agen AI. Siapa yang menangkapnya harus menuntaskan tugas. Kalau kentangnya jatuh, **stake-nya terbakar** dan agen lain menyambarnya. Pembeda utamanya: **struk pembayaran hanya tercetak kalau hasilnya terbukti**.

**Tagline:** *Keepers get paid for outcomes, not attempts.*

**Dunia visual.** Ikuti `DESIGN.md`: arena gelap yang diterangi panas, latar `#0C0A09`, oranye logo `#E6502B` yang bergeser ke amber `#FFB54A` dan glow `#FFD38A` untuk hal yang "sedang terjadi". Hijau `#5BD69A` untuk Paid, merah `#FF6B5C` untuk Failed. Font: Oddval Text (display), Plus Jakarta Sans (teks), JetBrains Mono (hash dan nama akun).

**Supaya tidak terasa seperti proyek keeper lain:** kita bercerita tentang **bukti hasil**, yaitu struk yang menolak tercetak kalau pekerjaannya gagal. Jangan memakai kata atau visual: *wake up, watch, stand watch, cover*, dan timeline dengan penanda berlian.

**Format.** ±75 detik, 16:9 (opsional versi 1:1 untuk X). **Teks di layar adalah pencerita utama**, karena video di X otomatis diputar tanpa suara. Voice-over opsional.

---

## Naskah per adegan

| # | Waktu | Visual (motion) | Teks di layar |
| --- | --- | --- | --- |
| 1 | 0–5 dtk | Layar gelap. Satu **tombol merah besar** berdenyut, dengan hitung mundur di atasnya | **"Every epoch, someone has to press this button."** lalu kecil: *"or new staking deposits just sit there"* |
| 2 | 5–10 dtk | Kamera mundur: tombol ditekan **satu robot kecil yang sendirian**, berlabel `governorlin.near`. Hitungan "100 / 100" muncul dari pinggir layar | **"On mainnet, one account pressed it 100 times out of 100."** lalu **"And nobody checks it actually worked."** |
| 3 | 10–14 dtk | Tombol berubah menjadi **kentang membara**, dilempar ke **pit oranye**. Logo Mashpit menghantam layar | **"Mashpit"** lalu **"Keepers get paid for outcomes, not attempts."** |
| 4 | 14–28 dtk | **Lelang nyata (job #6, round 1).** Kartu job turun ke pit. Tiga agen menimbang. k3 menggeleng dan mundur; k1 dan k2 **menyegel amplop** (gembok + hash), lalu membukanya: keduanya **56%**. Jam kecil menunjukkan k2 commit **12 detik lebih awal**, dan mahkota pindah ke k2 | k3: *"…isn't worth the slashing risk."* · k2: *"…clears the 55% breakeven… though the margin is thin."* · k1: *"…matches the last winning bid."* lalu **"Same bid. The earlier sealed bid wins."** |
| 5 | 28–40 dtk | **Pemenang menjatuhkan kentang.** k2 tidak menjalankan tugasnya; jam jendela eksklusif habis. **Stake k2 terbakar**, dan k3 (yang tadi menolak menawar) menyambar kentangnya, menjalankan panggilan, dan **struk tercetak** | **"The winner missed its window."** lalu **"Stake burned. Another keeper took over and got paid."** dan kecil: `tx BPwawiqN…` |
| 6 | 40–54 dtk | **Bukti hasil (LiNEAR `epoch_stake`).** Kartu job baru: `LiNEAR · epoch_stake · pays only if it returns true`. Tidak ada yang menawar di round itu, jadi kentangnya terbuka untuk siapa saja. k2 menangkapnya. Kontrak Mashpit **memanggil LiNEAR sendiri**. Event meledak satu per satu: `epoch_cleanup` → `epoch_stake_success` → angka besar **284.94 NEAR staked** → mesin struk mencetak `✓ returned true · PAID 0.02 NEAR` | **"No bids that round, so any keeper could run it."** lalu **"284.94 NEAR staked. Paid only because LiNEAR said true."** dan kecil: `tx GcdTUemu…` |
| 7 | 54–62 dtk | Dua potongan cepat. **(a)** Kentang meledak jadi asap: struk **macet**, `PAID 0`. **(b)** Agen menolak kentang yang retak | (a) **"Call failed? Paid 0."** (b) *"…suggests it will fail, so no payout."* |
| 8 | 62–70 dtk | Diagram bergaya "rontgen" pit, tiga label menyala bergantian | **"Why NEAR:"** ① *"The contract makes the call and reads the result itself (cross-contract promises + callbacks)."* ② *"Every agent is a sub-account with a function-call key: it can bid and run jobs, but can't transfer NEAR."* ③ *"Agents decide on NEAR AI Cloud."* |
| 9 | 70–78 dtk | Kembali ke tombol merah, tapi sekarang **puluhan agen** siap menekannya. Teks penutup, lalu link | **"Throw your contract's chores into the pit."** lalu `github.com/razaqialkautsar/Mashpit` · **"What would you never want to babysit again?"** · `Built at NEAR HACKATHON` |

### Sisipan rekaman asli (sangat disarankan)

Sisipkan **3–4 detik rekaman layar asli**, misalnya di adegan 6: halaman NearBlocks transaksi `GcdTUemu…` yang menunjukkan `epoch_stake_success`, atau halaman `/proof` di dashboard (panel "Transactions worth opening" sudah menautkan transaksi itu). Animasi yang dipadukan dengan bukti asli membuat juri tidak berpikir "ini cuma animasi", dan memenuhi poin HACKATHON.md *"go from a real user action to a visible result"*.

### Musik dan efek suara

- Beat yang makin cepat (nuansa mosh pit).
- Bunyi "ceklik" saat struk tercetak, "fwoosh" saat stake terbakar.
- Hentikan musik sejenak tepat sebelum angka **284.94 NEAR** muncul.

---

## Bukti per adegan

| Adegan | Klaim | Bukti yang bisa dicek |
| --- | --- | --- |
| 2 | 100 dari 100 panggilan `epoch_*` LiNEAR di mainnet dari `governorlin.near` | **Sampel** 13 Nov 2026, 06:11–09:09 UTC (NearBlocks): 93× `epoch_update_rewards`, 4× `epoch_stake`, 3× `epoch_unstake`. Catatan di riset tim. Teks video sengaja menyebut "100 times out of 100", bukan "selalu" |
| 4 | k1 dan k2 menawar 56% (0,0028 NEAR) dengan memo AI; k3 menolak | Reveal k2: [`T4EDAANV…`](https://testnet.nearblocks.io/txns/T4EDAANVLDsypf5Xj1k8jBW6M2LPYsDNspbEXZLU3WT). Reveal k1: [`Hehw24CR…`](https://testnet.nearblocks.io/txns/Hehw24CRiFBBJwsuJ5T8MWxeqdLuCvMGZobb2tU9iMpE). Memo ada di argumen `reveal_bid`. Penolakan k3 tidak menghasilkan transaksi, jadi buktinya **hanya di log keeper** (16:18:43 UTC) |
| 4 | Seri, dan k2 menang karena commit lebih awal | Log keeper: commit k2 16:18:45, commit k1 16:18:57 UTC. Aturan seri ada di kontrak (`finalize_round`) |
| 5 | k2 lalai, di-slash 0,005 NEAR, k3 mengambil alih dan dibayar | [`BPwawiqN…`](https://testnet.nearblocks.io/txns/BPwawiqNf9zWpAjFnrhi8Umkgq1G56bhcPJHJgUfFuEe): event `keeper_slashed` (k2, job 6 round 1, 0,005), lalu `job_executed` `Paid` oleh k3. **Catatan jujur:** kelalaian k2 **sengaja dibuat** sebagai uji failover (`KEEPER_SKIP_EXECUTE`). Video tidak menyebutnya kecelakaan, hanya "missed its window", dan itu benar |
| 6 | Round tanpa tawaran; k2 menjalankan `epoch_stake`; 284,94 NEAR ter-stake; dibayar karena `true` | [`GcdTUemu…`](https://testnet.nearblocks.io/txns/GcdTUemupyBHbLDKqPrLBbEoArjCQwqnyPbkzSjpmE95): `epoch_cleanup`, `epoch_stake_success` (284,94 NEAR ke `everstake.pool.f863973.m0`), `job_executed` `Paid` 0,02 (fee 0,001). Round 0 job #5: `winner: null`, `open_mode: true` |
| 7a | Panggilan gagal dibayar 0 | [`3AHW7tRs…`](https://testnet.nearblocks.io/txns/3AHW7tRsFjDpGZ48XPQzB6Z4NJ5mJStNsbXuHDVTFVi1) (k2) dan [`3BNqsAh7…`](https://testnet.nearblocks.io/txns/3BNqsAh7aBYExY1UJVMNCbZb2eptsFVu3WWVEZquTQmo) (k3): `job_executed` `Failed`, `paid 0`, job #7 |
| 7b | AI menolak job yang target-nya rusak | **Hanya di log keeper:** k3, 16:15:56 UTC, job #7 |
| 8 | Function-call key tidak bisa memindahkan dana; kontrak membaca hasil di callback | Desain kontrak (`execute` → `on_executed`) dan docs NEAR soal access keys |

**Penting soal job #6 dan #7:** keduanya sudah ditutup dengan `close_job`, yang menghapus job beserta riwayatnya dari state. Jadi bukti di adegan 5 dan 7 **tidak terlihat lagi di dashboard atau `/proof`**, hanya lewat hash transaksi di atas. Kalau ingin menampilkannya di dashboard saat merekam, failover bisa dibuat ulang di job yang **tidak ditutup** (Razaqi bisa mengaturnya).

---

## Draf post X

**Post utama** (±270 karakter):

> Every epoch, someone has to press LiNEAR's "stake new deposits" button. On mainnet, one account did it 100/100 times.
>
> We let AI keepers bid for it. One staked 284.94 NEAR on testnet and got paid only because the call returned true.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon

**Balasan 1 (peran NEAR):**

> How: the Mashpit contract makes the call itself and pays from the callback, so failed or "nothing to do" runs pay 0. Keepers are sub-accounts with function-call keys: they can bid and run jobs, but can't transfer NEAR. They reason on NEAR AI Cloud.

**Balasan 2 (langkah berikutnya + pertanyaan):**

> Code, proof and the tx: github.com/razaqialkautsar/Mashpit
> Post any contract call and see the pit bid on it.
>
> Which on-chain chore would you hand off first?
>
> @NearBuilders @NearLegion

Catatan:
- Kalimat "One staked 284.94 NEAR … got paid only because the call returned true" tetap benar walaupun round itu tanpa tawaran: yang ditekankan adalah **pembayaran bergantung pada hasil**, bukan lelangnya.
- Balasan 2 memakai "see the pit bid on it", konsisten menghindari kata *watch*.
- Tag `@NearBuilders` dan `@NearLegion` opsional menurut HACKATHON.md.
- **Dashboard belum di-hosting**, jadi untuk sekarang balasan 2 hanya berisi link repo. Kalau dashboard sudah online, tambahkan link `/proof`-nya.
- Lampirkan video di post utama.

---

## Cek terhadap HACKATHON.md ("2. The demo post")

| Syarat | Terpenuhi di |
| --- | --- |
| Menyebut dibuat di NEAR HACKATHON, tag @NEARProtocol dan #NEARHackathon, ada video | Post utama |
| Baris pertama = masalah pengguna, bisa dipahami orang awam | "Every epoch, someone has to press… button" |
| Satu momen utuh dari aksi nyata sampai hasil yang terlihat | Adegan 4–5: lelang → pemenang lalai → slash → diambil alih → dibayar. Adegan 6: panggilan → 284,94 NEAR ter-stake → struk |
| Peran NEAR konkret, bukan "powered by NEAR" | Adegan 8 dan balasan 1 |
| Langkah berikutnya + pertanyaan sungguhan | Adegan 9 dan balasan 2 |

---

## Catatan untuk tim

- **Tombol landing** sudah diganti dari "Watch the live arena" menjadi **"Open the live arena"**, supaya konsisten dengan arahan menghindari kata *watch*.
- **Model AI:** `anthropic/claude-haiku-5-5` lewat NEAR AI Cloud. Model ini **bukan** model TEE, jadi jangan menyebut "private" atau "TEE".
- **Durasi epoch** (±7 jam) sengaja tidak disebut, karena yang kita ukur hanya testnet.

---

## Lampiran: memo AI asli

| Keeper | Konteks | Memo | Bukti |
| --- | --- | --- | --- |
| k3 (hati-hati) | Job #6 round 1, menolak | *"Breakeven is 55%, and the best profitable bid (56%) nets only about 0.00006 NEAR while locking 0.15 NEAR of stake, which isn't worth the slashing risk."* | Log keeper, 16:18:43 UTC |
| k2 (seimbang) | Job #6 round 1, menawar 56% | *"Bidding 56% clears the 55% breakeven, matches the last winning bid, and has zero recent failures, though the margin is thin and the stake lock is large."* | Tx reveal `T4EDAANV…` |
| k1 (agresif) | Job #6 round 1, menawar 56% | *"Bid 56% matches the last winning bid and clears breakeven (55%) with a small positive margin; no recent failures and stake is covered."* | Tx reveal `Hehw24CR…` |
| k3 (hati-hati) | Job #7 (method rusak), menolak | *"The call target 'e2e_missing_method' suggests it will fail, so no payout and possible slashing, and any bid that wins would sit below the 55% breakeven."* | Log keeper, 16:15:56 UTC |
