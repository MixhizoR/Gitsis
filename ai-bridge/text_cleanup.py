# -*- coding: utf-8 -*-
"""
Üretilen madde metinleri için ORTAK temizleme.
4B model prompt'lardaki örnek formatları sızdırıyor (etiket, numara, markdown,
'GEREKSİNİM:/BAŞARILI TEST:' echo'su vb.). Bu fonksiyon hepsini deterministik temizler.
"""
import re

# Baştan silinecek etiketler (büyük/küçük harf duyarsız; Türkçe İ/ı destekli)
_LABEL = re.compile(
    r"(?is)^\s*("
    r"kmtd|kabul( muayene)? test[İIıi]?|"
    r"sitet|s[İIıi]stem [İIıi]şletme test[İIıi]?|"
    r"alt s[İIıi]stem test[İIıi]|alt s[İIıi]stem gereks[İIıi]n[İIıi]m[İIıi]|"
    r"dtet[- ]?ytet|dtet|ytet|"
    r"donanım\s*[-/]\s*yazılım(?:\s+geliştirme)?(?:\s+özeti)?|dgö\s*[-/]?\s*ygö|"
    r"test senaryosu|senaryo|gereks[İIıi]n[İIıi]m|"
    r"\[?ast\]?|\[?kmtd\]?"
    r")\s*[-:]?\s*"
)
# 'GEREKSİNİM: ... BAŞARILI TEST: <asıl test>' echo'sunda baştan 'BAŞARILI TEST:'e kadarını at
_BASARILI = re.compile(r"(?is)^.*?başarılı test\s*:?\s*")


def temizle(text, test=False):
    """Bir madde metnindeki etiket/numara/markdown/echo artıklarını temizler."""
    if not text:
        return text
    t = re.sub(r"\*+", "", text)                 # markdown yıldızları (**, ****)
    t = t.replace("\r", " ").replace("\n", " ")
    if test:                                     # test echo'su: BAŞARILI TEST'ten sonrasını al
        m = _BASARILI.match(t)
        if m and t[m.end():].strip():
            t = t[m.end():]
    t = re.sub(r"^\s*\d+\s*[\.\)]\s*", "", t)     # baştaki '1.' / '2)'
    t = _LABEL.sub("", t)                         # baştaki etiket(ler)
    t = re.sub(r"^\s*\d+\s*[\.\)]\s*", "", t)     # etiket sonrası kalan numara
    t = t.replace('"', " ")
    t = re.sub(r"\s+", " ", t).strip(" .:-()[]")
    while t and t[0] in "([-" and t[-1] in ")]":
        t = t[1:-1].strip()
    return t


# DSB ile birlikte görülen çelişkili/uydurma sayıları temizlemek için birim ve sayı kalıbı
_DSB_UNITS = (r"(?:°\s*[cCsSfF]|°|santigrat|derece|mbps|kbps|gbps|bps|ghz|mhz|khz|hz|"
              r"gb|mb|kb|tb|milisaniye|ms|saniye|sn|dakika|dk|saat|gram|gr|kg|mg|g|"
              r"litre|lt|ml|l|mm|cm|km|m|dbm|db|bar|volt|amper|watt|dpi|fps|%|adet|kez)")
_DSB_NUM = r"\d+(?:[.,]\d+)?"


def dsb_temizle(text):
    """
    Bir metinde 'DSB' geçiyorsa, DSB'nin (Daha Sonra Belirlenecek) ANLAMIYLA ÇELİŞEN
    uydurma sayıları temizler:
      - '93°C sıcaklık aralığında (DSB)'  → 'DSB sıcaklık aralığında'   (somut değer + (DSB) işareti)
      - '(örneğin 100g)', '(20 °C)', '(0.5 saniye)' → silinir            (parantezli örnek/değer)
      - '100g DSB' (DSB'den önce sayı)     → 'DSB'
      - 'DSB 2 saniye' (DSB'den sonra sayı) → 'DSB saniye'
      - yalnız '(DSB)' işareti             → 'DSB'
    NOT: '(RS485)', '(ARM Cortex-M7)' gibi teknik adlar KORUNUR (örnek değer değil).
    Ayrı bir boyuttaki bağımsız sayılar (ör. cümlenin başka yerindeki bir test süresi)
    kasıtlı olarak DOKUNULMAZ — onlar DSB ile doğrudan çelişmez.
    """
    if not text or "DSB" not in text.upper():
        return text
    t = text
    # -3) TİRE İLE YAPIŞIK UYDURMA DEĞER: model 'DSB-15 saniye' gibi DSB'yi sayıya yapıştırıyor.
    #     Kaynak değeri vermediği için sayı UYDURMA; 'DSB <birim>' bırak.
    #     'DSB-15 saniye' → 'DSB saniye', 'DSB-20sn' → 'DSB sn'
    t = re.sub(r"\bDSB\s*[-–—]\s*" + _DSB_NUM + r"\s*(" + _DSB_UNITS + r")", r"DSB \1", t, flags=re.I)
    #     'DSB-15' (birimsiz, tire ile) → 'DSB'
    t = re.sub(r"\bDSB\s*[-–—]\s*" + _DSB_NUM + r"\b", "DSB", t, flags=re.I)
    # -2) 'DSB-malıdır/-melidir' (DSB fiilin yerine sızmış) → 'DSB olmalıdır' (değer belirlenecek)
    t = re.sub(r"\bDSB\s*[-–—]\s*(?:ol)?(?:mal[ıi]d[ıi]r|melidir)\b", "DSB olmalıdır", t, flags=re.I)
    t = re.sub(r"\bDSB\s*[-–—]\s*(?:mal[ıi]|meli)\b", "DSB olmalı", t, flags=re.I)
    # -1) DSB + hal eki YANLIŞ ('DSB'ye tamamlanması' gibi sözde nesne) → kaldır. KORU: "DSB'dir".
    t = re.sub(r"\bDSB['’](?:ye|ya|de|da|te|ta|deki|daki|nde|nda|na|ne)\b\s*", "", t, flags=re.I)
    # -0b) çelişki: '(DSB = 15 saniye)' → '(DSB)'   |  sarkan/kapanmayan '(DSB' → 'DSB'
    t = re.sub(r"\(\s*DSB\s*=\s*" + _DSB_NUM + r"\s*" + _DSB_UNITS + r"?\s*\)", "(DSB)", t, flags=re.I)
    t = re.sub(r"\(\s*DSB\b(?!\s*\))", "DSB", t, flags=re.I)
    # -0a) misuse: 'DSB olarak belirtilmiş olsa da,' (DSB'yi anlatılan bir durum sanmış) → kaldır
    t = re.sub(r"\bDSB\s+olarak\s+belir(?:tilmiş|lenmiş|tilen|lenen)\s+"
               r"(?:olsa da|olmasına rağmen|olmakla birlikte|olduğu halde)\s*,?\s*", "", t, flags=re.I)
    # 0) YANLIŞ DSB KULLANIMLARI: DSB bir DEĞER yer tutucusudur; standart/kap/puan adı DEĞİL.
    #    'DSB standard*' → 'ilgili standard*'
    t = re.sub(r"\bDSB\s+(standard\w*)", r"ilgili \1", t, flags=re.I)
    #    'DSB içerisinde/içinde/boyunca...' (sahte kap/zaman) → kaldır
    t = re.sub(r"\bDSB\s+(içerisinde|içinde|boyunca|süresince|aralığında)\b", "", t, flags=re.I)
    #    'DSB' + (birim/ol.../değer.../belirlen... DIŞINDA) bir kelime → sadece 'DSB'yi kaldır.
    #    \w* ile Türkçe EK'leri de kapsa: 'milisaniyeden' (birim+ek), 'olmalıdır' (ol+ek) KORUNUR.
    t = re.sub(r"\bDSB\s+(?!(?:" + _DSB_UNITS + r"|ol|değer|belirlen)\w*\b)"
               r"([a-zA-ZçğıöşüÇĞİÖŞÜ])", r"\1", t, flags=re.I)
    # A) '<sayı><birim> ...(en fazla 4 kelime)... (DSB)' → sayıyı 'DSB' yap, (DSB)'yi kaldır
    t = re.sub(_DSB_NUM + r"\s*" + _DSB_UNITS + r"?((?:\s+\S+){0,4}?)\s*\(\s*DSB\s*\)",
               r"DSB\1", t, flags=re.I)
    # B) 'örneğin/yaklaşık ...' içeren parantezleri sil
    t = re.sub(r"\s*\([^()]*(?:örneğin|örn\.?|ör\.?|yaklaşık|yakl\.?)[^()]*\)", "", t, flags=re.I)
    # C) sadece sayı(+birim) olan parantezleri sil: (100g), (20 °C), (0.5 saniye), (100)
    t = re.sub(r"\s*\(\s*[~≈]?\s*" + _DSB_NUM + r"\s*" + _DSB_UNITS + r"?\.?\s*\)", "", t, flags=re.I)
    # D) DSB'den ÖNCE gelen sayı(+birim): '100g DSB' -> 'DSB'
    t = re.sub(r"\b" + _DSB_NUM + r"\s*" + _DSB_UNITS + r"?\s+DSB\b", "DSB", t, flags=re.I)
    # E) DSB'den SONRA gelen sayı: 'DSB 2 saniye' -> 'DSB saniye'
    t = re.sub(r"\bDSB\s+" + _DSB_NUM + r"\s*", "DSB ", t, flags=re.I)
    # F) kalan yalnız '(DSB)' -> 'DSB'
    t = re.sub(r"\(\s*DSB\s*\)", "DSB", t, flags=re.I)
    # boşluk/noktalama düzelt
    t = re.sub(r"\s{2,}", " ", t)
    t = re.sub(r"\s+([.,;:])", r"\1", t)
    return t.strip()


def sayilari_dsb_yap(text):
    """
    Metindeki '<sayı><birim>' değerlerini 'DSB <birim>' yapar.
    Kaskadda üst madde DSB iken alt madde SAYI UYDURDUYSA, çelişkili 'değer DSB'dir' notu
    yerine bu fonksiyon uydurma sayıları doğrudan DSB'ye çevirir.
    Örn: '500ms içinde' → 'DSB ms içinde', '1 saniyeden' → 'DSB saniyeden'.
    """
    if not text:
        return text
    t = re.sub(r"\b\d+(?:[.,]\d+)?\s*(" + _DSB_UNITS + r")", r"DSB \1", text, flags=re.I)
    t = re.sub(r"\bDSB\s+DSB\b", "DSB", t, flags=re.I)   # olası 'DSB DSB'
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()
