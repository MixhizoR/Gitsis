# Yeni PC'de Kurulum

## 1. Gereksinimler
- **Python 3.12.10** kurulu olmalı (python.org'dan). Kurarken "Add Python to PATH" işaretle.
- **VSCode** + **Python eklentisi** (Microsoft) kurulu olmalı.
- **LM Studio** kurulu ve içine bir model yüklü (config.py'daki `MODEL_NAME` ile aynı isimde, varsayılan: `google_gemma-3-4b-it`).

## 2. Proje klasörünü kopyala
Tüm `onlarınki` klasörünü yeni PC'ye kopyala.
> **`.venv` klasörünü kopyalama / sil** — yeni PC'de baştan oluşturulacak.
> `HuggingFaceEmbeddings/all-MiniLM-L6-v2` klasörünü **kopyala** (kopyalarsan model tekrar indirilmez).

## 3. Sanal ortam + paketler (PowerShell, proje klasöründe)
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 4. (Eğer model klasörünü kopyalamadıysan) embedding modelini indir
```powershell
.\.venv\Scripts\python.exe -c "from sentence_transformers import SentenceTransformer; import os; m=SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); m.save(os.path.join(os.getcwd(),'HuggingFaceEmbeddings','all-MiniLM-L6-v2'))"
```

## 5. Çalıştır
- VSCode'da `Arayüz.py`'ı aç → **F5** (veya sağ üstte ▶).
- `.vscode/launch.json` ve `.vscode/settings.json` venv'i otomatik kullanır, ayar gerekmez.

## Notlar
- LM Studio açık ve model yüklü olmalı (üretim adımı için).
- `symspellpy` kurulmaz (C++ derleyici ister) ama opsiyoneldir, programı etkilemez.
