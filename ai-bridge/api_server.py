# -*- coding: utf-8 -*-
# ============================================================================
#  api_server.py  —  EHSIM "AI Belge Analizi" KOPRU SERVISI (FastAPI)
# ----------------------------------------------------------------------------
#  AMAC: Arkadasin LM Studio + Gemma motorunu, PDF/HTML/tkinter uretmeden,
#  SADECE JSON donen hafif bir HTTP API'ye cevirir. Modern arayuzumuz bu
#  servise belge + istenen adetleri gonderir; servis Kullanici / Sistem /
#  Alt-Sistem gereksinimlerini cikarip temiz bir JSON listesi dondurur.
#
#  - Veritabanina YAZMAZ. Test eslestirmesi (Verify/Satisfy) YAPMAZ.
#    O isler bizim mevcut sitemizin kendi API'siyle yapilir (bu servis karismaz).
#  - Ayni LM Studio adresini ve modelini (config.py) kullanir.
#  - PyMuPDF (fitz) ile PDF metnini cikarir; ayrica duz metin de kabul eder.
#
#  UCLAR:
#    GET  /health              -> servis + LM Studio durumu
#    POST /analyze             -> belge (dosya/metin) + adetler => gereksinim JSON
#    POST /regenerate          -> tek bir maddeyi (begenilmeyeni) yeniden uretir
#
#  CALISTIRMA (proje klasoru = "ai-bridge"):
#    .\.venv\Scripts\python.exe -m pip install fastapi uvicorn python-multipart
#    .\.venv\Scripts\python.exe -m uvicorn api_server:app --host 0.0.0.0 --port 8008
#  (LM Studio acik ve config.py'daki MODEL_NAME yuklu olmali.)
# ============================================================================

import re
import json
import requests
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- config.py'yi tekrar kullan (LM Studio adresi + model adi) --------------
try:
    from config import LMSTUDIO_BASE_URL, LMSTUDIO_API_KEY, MODEL_NAME
except Exception:
    # config.py bulunamazsa makul varsayilanlar (LM Studio yerel).
    LMSTUDIO_BASE_URL = "http://localhost:1234/v1"
    LMSTUDIO_API_KEY = "lm-studio"
    MODEL_NAME = "google_gemma-3-4b-it"

# --- PDF metin cikarma (PyMuPDF) --------------------------------------------
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except Exception:
    PYMUPDF_AVAILABLE = False


# ============================================================================
#  UYGULAMA
# ============================================================================
app = FastAPI(
    title="EHSIM AI Bridge",
    version="1.0",
    description="LM Studio + Gemma tabanli gereksinim cikarma koprusu (sadece JSON).",
)

# Modern arayuz (Vite: 5173) buradan cagirir. Gelistirme icin hepsine acik.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
#  SEVIYE TANIMLARI  —  bizim sitenin REQ_TYPE degerleriyle birebir eslesir.
#  (frontend/constants.js: 'User/System/Software/Hardware Requirement')
# ============================================================================
LEVELS = {
    "user": {
        "label": "Kullanici Gereksinimi",
        "req_type": "User Requirement",
        "noun": "kullanici (paydas) gereksinimi",
        "rule": (
            "Kullanicinin/paydasin BEKLENTISINI ifade eden ust seviye gereksinimler olsun; "
            "teknik cozum degil, ne istendigini anlatsin."
        ),
    },
    "system": {
        "label": "Sistem Gereksinimi",
        "req_type": "System Requirement",
        "noun": "sistem gereksinimi",
        "rule": (
            "Sistemin islevsel/performans davranisini tanimlayan gereksinimler olsun; "
            "mumkunse olculebilir (sure, esik, yuzde) kriter icersin."
        ),
    },
    "subsystem": {
        "label": "Alt-Sistem Gereksinimi",
        "req_type": "Software Requirement",
        "noun": "alt-sistem (yazilim/donanim) gereksinimi",
        "rule": (
            "Sistemi hayata geciren alt-sistem (yazilim veya donanim) seviyesinde "
            "somut, uygulanabilir gereksinimler olsun."
        ),
    },
}


# ============================================================================
#  LLM CAGRISI  —  arkadasin call_gemma3_api mantiginin sade hali.
# ============================================================================
def call_llm(prompt: str, max_tokens: int = 700, temperature: float = 0.4,
             system_message: Optional[str] = None) -> Optional[str]:
    url = f"{LMSTUDIO_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {LMSTUDIO_API_KEY}",
        "Content-Type": "application/json",
    }
    messages = []
    if system_message:
        messages.append({"role": "system", "content": system_message})
    messages.append({"role": "user", "content": prompt})
    data = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    try:
        r = requests.post(url, headers=headers, json=data, timeout=180)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503,
                            detail="LM Studio'ya baglanilamadi. LM Studio acik ve model yuklu mu?")
    except requests.exceptions.RequestException as e:
        detail = str(e)
        if getattr(e, "response", None) is not None:
            detail += f" | {e.response.text[:400]}"
        raise HTTPException(status_code=502, detail=f"LM Studio API hatasi: {detail}")


# ============================================================================
#  METIN CIKARMA + CIKTI TEMIZLEME
# ============================================================================
def extract_pdf_text(raw: bytes) -> str:
    if not PYMUPDF_AVAILABLE:
        raise HTTPException(status_code=500,
                            detail="PyMuPDF (fitz) yuklu degil: pip install PyMuPDF")
    text = ""
    with fitz.open(stream=raw, filetype="pdf") as doc:
        for page in doc:
            page_text = page.get_text("text", sort=True) or ""
            if page_text.strip():
                text += page_text + "\n"
    return text


# Turkce karakterleri ASCII'ye indirger (meta/onsoz eslemesi guvenilir olsun).
def _norm(s: str) -> str:
    for a, b in (("İ", "i"), ("I", "i"), ("ı", "i"), ("Ş", "s"), ("ş", "s"),
                 ("Ç", "c"), ("ç", "c"), ("Ğ", "g"), ("ğ", "g"),
                 ("Ö", "o"), ("ö", "o"), ("Ü", "u"), ("ü", "u")):
        s = s.replace(a, b)
    return s.lower().strip()

# Onsoz / baslik / meta satiri isaretleri (normalize edilmis halleriyle).
_META_HINTS = ("iste ", "iste,", "asagida", "cikaril", "gereksinimler:",
               "maddeler", "istenilen", "verilen metin", "belgeden cikaril",
               "iste metinden", "metinden cikaril", "asagidaki")
# Bir satirin gereksinim degil BASLIK/ONSOZ oldugunu gosteren kaliplar.
_HEADING_RE = re.compile(
    r"^(iste\b|asagida|metinden|bu belge|belgeden|kullanici gereksinim|"
    r"sistem gereksinim|alt[- ]?sistem gereksinim|gereksinim(ler)?\b|"
    r"\d+\s+(farkli|adet)\b)",
    re.I,
)


def clean_lines(response: str) -> List[str]:
    """LLM ciktisini satirlara boler; numara/tire/onsoz/baslik/aciklama temizler."""
    if not response:
        return []
    # Model bazen hepsini tek satira "1. ... 2. ... 3. ..." diye yazar; once
    # numarali isaretlerin onune satir sonu koyup gercek maddelere ayir.
    text = re.sub(r"\s+(\d{1,2})[\.\)]\s+", r"\n\1. ", response.strip())
    items = []
    for line in text.split("\n"):
        line = line.strip().strip("•*-–—").strip()
        line = re.sub(r"^\s*\d+[\.\)]\s*", "", line).strip(" .:-\t")
        # ' - Bu gereksinim ...' gibi aciklama kuyrugunu at
        line = re.sub(r"\s*[-–—]\s*(bu (gereksinim|madde|ister|ozellik)|aciklama)\b.*$",
                      "", line, flags=re.I)
        if not line or len(line.split()) <= 4:
            continue
        if line.endswith(":"):
            continue
        n = _norm(line)
        if any(m in n for m in _META_HINTS):
            continue
        if _HEADING_RE.match(n):
            continue
        items.append(line)
    return items


def derive_title(sentence: str, max_words: int = 13, max_chars: int = 110) -> str:
    """Gereksinim cumlesinden OKUNUR bir baslik turetir.
    Kelime ortasindan ASLA kesmez; gerekirse son tam kelimede kesip '…' ekler."""
    t = re.sub(r"\bREQ[-_ ]?[A-Z]{1,4}[-_ ]?\d{1,4}\b", "", sentence).strip()
    t = t.strip(" .;:\t")
    words = t.split()
    truncated = False
    if len(words) > max_words:
        t = " ".join(words[:max_words])
        truncated = True
    # Karakter siniri: yine KELIME sinirinda kes (ortadan degil).
    if len(t) > max_chars:
        t = t[:max_chars].rsplit(" ", 1)[0]
        truncated = True
    t = t.rstrip(" .;:,")
    if truncated:
        t += "…"
    if not t:
        return sentence[:60]
    return t[:1].upper() + t[1:]


# ============================================================================
#  URETIM PROMPTU  —  arkadasin SGD prompt tarzi, seviyeye gore.
# ============================================================================
def build_prompt(level_key: str, source_text: str, count: int,
                 avoid: Optional[List[str]] = None) -> str:
    lv = LEVELS[level_key]
    avoid_block = ""
    if avoid:
        prev = "\n".join(f"- {a}" for a in avoid[-20:])
        avoid_block = f"\nSu maddeler zaten uretildi, bunlari TEKRAR ETME veya benzerini yazma:\n{prev}\n"
    return (
        f"GOREV: Asagidaki belgeyi incele ve TAM {count} adet {lv['noun']} yaz.\n\n"
        f"CIKTI KURALLARI (cok onemli):\n"
        f"- Tam olarak {count} madde yaz; ne eksik ne fazla.\n"
        f"- Her maddeyi '1.', '2.', '3.' ... diye numaralandir ve HER BIRINI AYRI SATIRA yaz.\n"
        f"- ONSOZ/BASLIK/ACIKLAMA YAZMA. 'Iste', 'Asagida', 'Metinden cikarilan' gibi hicbir giris cumlesi olmasin. SADECE numarali maddeler.\n"
        f"- Her madde tek ve tam bir Turkce cumle olsun, zorunluluk kipiyle bitsin (orn: '... secebilmelidir', '... olmalidir', '... yapmalidir').\n"
        f"- {lv['rule']}\n"
        f"- Maddeler birbirinden FARKLI konularda olsun, tekrar etmesin.\n"
        f"{avoid_block}\n"
        f"ORNEK BICIM:\n1. Sistem, ... yapmalidir.\n2. Kullanici, ... secebilmelidir.\n\n"
        f"BELGE:\n{source_text[:3500]}"
    )


def generate_level(level_key: str, source_text: str, count: int,
                   avoid: Optional[List[str]] = None) -> List[dict]:
    """Istenen SAYIDA madde toplanana kadar (kucuk model icin) birkac kez dener."""
    if count <= 0:
        return []
    lv = LEVELS[level_key]
    base_avoid = list(avoid or [])
    collected: List[dict] = []
    seen = set()

    for _ in range(5):  # en fazla 5 tur; her tur eksik kalani ister
        need = count - len(collected)
        if need <= 0:
            break
        avoid_now = base_avoid + [c["description"] for c in collected]
        prompt = build_prompt(level_key, source_text, need, avoid_now)
        raw = call_llm(prompt, max_tokens=min(need * 90 + 150, 1600), temperature=0.5)
        for line in clean_lines(raw):
            key = _norm(line)[:90]
            if key in seen:
                continue
            seen.add(key)
            collected.append({
                "level": level_key,
                "type": lv["req_type"],       # dogrudan sitenin REQ_TYPE degeri
                "title": derive_title(line),
                "description": line,
            })
            if len(collected) >= count:
                break

    return collected[:count]


# ============================================================================
#  ISTEK / YANIT MODELLERI
# ============================================================================
class RegenerateBody(BaseModel):
    level: str                         # user | system | subsystem
    source_text: str                   # analizde kullanilan belge metni
    avoid: Optional[List[str]] = None  # tekrar edilmemesi gereken basliklar/cumleler


@app.get("/health")
def health():
    """Servis + LM Studio erisim durumu."""
    reachable = False
    detail = ""
    try:
        r = requests.get(f"{LMSTUDIO_BASE_URL}/models", timeout=5,
                         headers={"Authorization": f"Bearer {LMSTUDIO_API_KEY}"})
        reachable = r.ok
    except Exception as e:
        detail = str(e)
    return {
        "ok": True,
        "service": "EHSIM AI Bridge",
        "model": MODEL_NAME,
        "lmstudio_url": LMSTUDIO_BASE_URL,
        "lmstudio_reachable": reachable,
        "pymupdf": PYMUPDF_AVAILABLE,
        "detail": detail,
    }


@app.post("/analyze")
async def analyze(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
    n_user: int = Form(default=5),
    n_system: int = Form(default=8),
    n_subsystem: int = Form(default=8),
):
    """Belge (PDF dosyasi veya duz metin) + istenen adetler => gereksinim JSON listesi."""
    # 1) Kaynak metni topla
    source = (text or "").strip()
    if file is not None:
        raw = await file.read()
        name = (file.filename or "").lower()
        if name.endswith(".pdf"):
            source = (extract_pdf_text(raw) + "\n" + source).strip()
        else:
            try:
                source = (raw.decode("utf-8", errors="replace") + "\n" + source).strip()
            except Exception:
                pass
    if len(source) < 20:
        raise HTTPException(status_code=400,
                            detail="Belge metni bos/cok kisa. PDF yukleyin ya da metin yapistirin.")

    # 2) Her seviye icin uret
    requirements = []
    for key, n in (("user", n_user), ("system", n_system), ("subsystem", n_subsystem)):
        requirements.extend(generate_level(key, source, int(n)))

    # 3) Kimlik + ozet
    for i, r in enumerate(requirements, start=1):
        r["id"] = i
    summary = {
        "user": sum(1 for r in requirements if r["level"] == "user"),
        "system": sum(1 for r in requirements if r["level"] == "system"),
        "subsystem": sum(1 for r in requirements if r["level"] == "subsystem"),
        "total": len(requirements),
        "chars": len(source),
        "model": MODEL_NAME,
    }
    return {"ok": True, "summary": summary, "requirements": requirements}


@app.post("/regenerate")
def regenerate(body: RegenerateBody):
    """Begenilmeyen bir maddeyi ayni belge baglaminda, tekrar etmeden yeniden uretir."""
    if body.level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"Gecersiz seviye: {body.level}")
    if len((body.source_text or "").strip()) < 20:
        raise HTTPException(status_code=400,
                            detail="source_text gerekli (analizde kullanilan belge metni).")
    items = generate_level(body.level, body.source_text, 1, avoid=body.avoid)
    if not items:
        # Bir kez daha dene (kucuk modeller bazen bos donebilir).
        items = generate_level(body.level, body.source_text, 1, avoid=body.avoid)
    if not items:
        raise HTTPException(status_code=502, detail="Model yeni bir madde uretemedi, tekrar deneyin.")
    return {"ok": True, "requirement": items[0]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
