# -*- coding: utf-8 -*-
"""
Gereksinim Kalite Denetçisi (Requirement Quality Linter)
========================================================
Üretilen V-Model maddelerini INCOSE tarzı "iyi gereksinim" kurallarına göre denetler.
SALT-OKUNUR: hiçbir veriyi değiştirmez, sadece rapor üretir.
BAĞIMLILIKSIZ: yalnızca standart 're' kullanır (yeni pip paketi YOK).

Bu dosyayı silmek özelliği tamamen kaldırır (Arayüz.py'deki tek butonu da sil).
"""
import re

# Ölçülemeyen / öznel (subjektif) sıfat-zarflar → ölçülebilir kritere çevrilmeli
BELIRSIZ_KELIMELER = [
    # NOT: 'uygun', 'güvenli', 'kesintisiz', 'hassas', 'dayanıklı', 'sağlam' KASITEN çıkarıldı —
    # bunlar çoğu zaman meşru kullanımda ('standartlara uygun', 'güvenli mod') → yanlış alarm yapıyordu.
    "hızlı", "yavaş", "kolay", "zor", "iyi", "kötü", "yeterli", "yetersiz", "esnek",
    "kullanıcı dostu", "kullanıcı-dostu", "verimli", "optimal", "etkili", "kaliteli",
    "makul", "basit", "anlaşılır", "keyifli", "konforlu", "modern", "gelişmiş", "akıllı",
    "hoş", "şık", "pratik", "ideal", "mükemmel", "gerektiği gibi", "mümkün olduğunca",
    "en iyi", "üst düzey",
]
# Belirsiz nicelikler → sayı ile ifade edilmeli
BELIRSIZ_NICELIK = [
    "birkaç", "bazı", "çeşitli", "birçok", "pek çok", "yeterince",
    "gerektiği kadar", "kısmen", "bir miktar", "belirli sayıda",
]
# Kaçamak / koşullu ifadeler → gereksinimi belirsizleştirir ("...gerekirse")
KACAMAK_KELIMELER = [
    "gerekirse", "gerektiğinde", "gerektiği durumlarda", "gerekli görülürse",
    "mümkünse", "mümkün olduğunda", "mümkün olduğunca", "uygun olduğunda",
    "ihtiyaç halinde", "ihtiyaç duyulduğunda", "duruma göre", "genellikle",
    "çoğunlukla", "genelde", "tercihen", "opsiyonel olarak", "isteğe bağlı",
]
# Açık uçlu ifadeler → doğrulanamaz ("...vb.", "...gibi")
ACIK_UCLU = ["vb", "vs", "vesaire", "ve benzeri", "gibi"]
# Açıkça zayıf/belirsiz kiplik ("olabilir" = kesin değil).
# ÖNEMLİ: 'ölçülebilir', 'doğrulanabilir', 'kullanılabilir', 'erişilebilir' gibi
# yetenek/özellik sıfatları İYİDİR — bu yüzden LİSTEDE YOK, işaretlenmez.
ZAYIF_KIPLIK = ["olabilir", "olabilmekte", "olabilmektedir",
                "mümkündür", "mümkün olabilir", "olması mümkün"]


def _kelime_var(text, kelimeler):
    """Verilen kelimelerden metinde geçenleri (kelime sınırıyla) döndürür."""
    low = text.lower()
    bulunan = []
    for k in kelimeler:
        if re.search(r"(?<![a-zçğıöşü])" + re.escape(k) + r"(?![a-zçğıöşü])", low):
            bulunan.append(k)
    return bulunan


def denetle_madde(text, tip=""):
    """Bir madde için (ikon, mesaj) biçiminde sorun listesi döndürür. Boş liste = sorun yok."""
    if not text or not text.strip():
        return [("❌", "Boş / geçersiz madde")]
    low = text.lower()
    flags = []

    kel = _kelime_var(text, BELIRSIZ_KELIMELER)
    if kel:
        flags.append(("⚠️", "Belirsiz/öznel kelime (ölçülebilir kriter ekle): "
                      + ", ".join(f"'{k}'" for k in kel[:3])))

    nic = _kelime_var(text, BELIRSIZ_NICELIK)
    if nic:
        flags.append(("⚠️", "Belirsiz nicelik (sayı belirt): "
                      + ", ".join(f"'{k}'" for k in nic[:3])))

    # Kaçamak / koşullu ifadeler ("...gerekirse")
    kac = _kelime_var(text, KACAMAK_KELIMELER)
    if kac:
        flags.append(("⚠️", "Kaçamak/koşullu ifade (gereksinimi zayıflatır): "
                      + ", ".join(f"'{k}'" for k in kac[:3])))

    # Açık uçlu ifadeler ("...vb.", "...gibi", "...")
    au = _kelime_var(text, ACIK_UCLU)
    if "..." in text or "…" in text:
        au = au + ["..."]
    if au:
        flags.append(("⚠️", "Açık uçlu ifade (doğrulanamaz, listeyi tamamla): "
                      + ", ".join(f"'{k}'" for k in au[:3])))

    # Zayıf kiplik: yalnızca AÇIKÇA zayıf ifadeler ('olabilir', 'mümkündür').
    # 'ölçülebilir', 'kullanılabilir', 'doğrulanabilir' gibi İYİ sıfatlar İŞARETLENMEZ.
    zayif = _kelime_var(text, ZAYIF_KIPLIK)
    if zayif:
        flags.append(("⚠️", "Zayıf kiplik (kesinleştir, '-malıdır' kullan): "
                      + ", ".join(f"'{k}'" for k in zayif[:3])))

    if "DSB" in text.upper():
        flags.append(("📌", "Değer belirlenmemiş (DSB) — netleştirilmeli"))

    # Atomik değil: 2+ zorunluluk yüklemi VE bir bağlaç ('...ve...') birlikte olmalı
    yuklemler = re.findall(r"\b\w+(?:malıdır|melidir|malı|meli)\b", low)
    koordinator = re.search(
        r"(?<![a-zçğıöşü])(ve|veya|ayrıca|hem|aynı zamanda|ile birlikte)(?![a-zçğıöşü])", low)
    if len(yuklemler) >= 2 and koordinator:
        flags.append(("⚠️", f"Birden fazla gereksinim (bağlaç + {len(yuklemler)} yüklem) — "
                      "ayrı maddelere böl (atomik olmalı)"))

    # Çok uzun (doğrulaması zor) — bilgi amaçlı, puanı düşürmez
    n = len(text.split())
    if n > 30:
        flags.append(("ℹ️", f"Çok uzun ({n} kelime) — sadeleştir"))

    return flags


def denetle(flat_data):
    """
    Tüm maddeleri denetler.
    Döndürür: {'items': [{'id','tip','flags'} ...], 'summary': {...}}
    """
    items = []
    for _id, d in (flat_data or {}).items():
        f = denetle_madde(d.get("content", ""), d.get("type", ""))
        items.append({"id": d.get("ID", _id), "tip": d.get("type", ""), "flags": f})

    # Sorunlular önce, sonra ID sırası
    items.sort(key=lambda x: (len(x["flags"]) == 0, x["id"]))

    total = len(items)
    # Sadece ⚠️/❌ 'sorun' sayılır; 📌 DSB (değer bekliyor) ve ℹ️ bilgi puanı DÜŞÜRMEZ.
    problemli = sum(1 for it in items if any(ik in ("⚠️", "❌") for ik, _ in it["flags"]))
    temiz = total - problemli
    dsb = sum(1 for it in items if any(ik == "📌" for ik, _ in it["flags"]))
    kalite = round(100 * temiz / total) if total else 0
    return {"items": items,
            "summary": {"total": total, "temiz": temiz, "problemli": problemli,
                        "dsb": dsb, "kalite": kalite}}


def rapor_metni(report):
    """Rapor sözlüğünü okunur metne çevirir."""
    s = report["summary"]
    L = ["=" * 56, "   GEREKSİNİM KALİTE RAPORU (INCOSE tarzı denetim)", "=" * 56, ""]
    for it in report["items"]:
        if it["flags"]:
            L.append(f"● {it['id']}  [{it['tip']}]")
            for ikon, mesaj in it["flags"]:
                L.append(f"     {ikon} {mesaj}")
        else:
            L.append(f"✅ {it['id']}  [{it['tip']}]  — sorun yok")
    L += ["", "-" * 56,
          f"   Toplam: {s['total']}    Sorunsuz: {s['temiz']}    "
          f"Sorunlu (⚠️): {s['problemli']}    DSB (bekleyen 📌): {s['dsb']}",
          f"   ► KALİTE PUANI: %{s['kalite']}",
          "   (📌 DSB puanı düşürmez — 'değer sonra belirlenecek' demektir, hata değil)",
          "=" * 56]
    return "\n".join(L)
