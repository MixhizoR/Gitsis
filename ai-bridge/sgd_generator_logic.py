import os
import fitz  # PyMuPDF
from datetime import datetime
from llm_handler import call_gemma3_api
from config import CHUNK_SIZE, CHUNK_OVERLAP
from langchain_huggingface import HuggingFaceEmbeddings
import numpy as np
import time
import re  

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
except ImportError:
    print("reportlab yüklü değil: pip install reportlab")

try:
    import openpyxl
except ImportError:
    print("openpyxl yüklü değil: pip install openpyxl")


def extract_book_chunks(file_path, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP):
    """PDF veya TXT dosyasından metni chunk'lara ayırır."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        try:
            with fitz.open(file_path) as doc:
                full_text = ""
                for page in doc:
                    full_text += page.get_text("text", sort=True) + "\n"
        except Exception as e:
            raise Exception(f"PDF okuma hatası: {e}")
    elif ext == ".txt":
        with open(file_path, "r", encoding="utf-8") as f:
            full_text = f.read()
    else:
        raise Exception("Desteklenmeyen dosya formatı.")
    
    chunks = []
    start = 0
    while start < len(full_text):
        chunk = full_text[start:start + chunk_size]
        if len(chunk.strip()) > 50:
            chunks.append(chunk)
        start += chunk_size - chunk_overlap
    return chunks


def get_chunk_embeddings(chunks):
    """Chunk'ların embedding vektörlerini döndürür."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    yerel_model_yolu = os.path.join(base_dir, "HuggingFaceEmbeddings", "all-MiniLM-L6-v2")
    embedder = HuggingFaceEmbeddings(model_name=yerel_model_yolu)
    return np.array(embedder.embed_documents(chunks))


def generate_sgd_from_chunk(chunk_text, max_words=15, avoid_list=None):
    """Bir chunk'tan tek cümlelik Sistem Gereksinim Dökümanı (SGD) üretir. avoid_list verilirse ondan FARKLI bir madde üretir."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-12:])
        avoid_block = (
            f"\nAŞAĞIDAKİ MADDELER ZATEN ÜRETİLDİ; BUNLARI TEKRAR ETME, "
            f"metindeki BAŞKA/farklı bir gereksinimi seç:\n{onceki}\n"
        )
    prompt = (
        f"Aşağıdaki metni incele ve bu metinden çıkarılabilecek 1 adet Sistem Gereksinim Dökümanı (SGD) üret:\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Sadece 1 cümlelik, teknik ve işlevsel bir gereksinim yaz.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle ekleme.\n"
        f"- Sadece sistem gereksinim cümlesini ver.\n"
        f"{avoid_block}\n"
        f"Metin:\n{chunk_text[:3500]}"
    )
    response = call_gemma3_api(prompt, max_tokens=100)
    if not response:
        return None
    line = response.strip().split("\n")[0]
    words = line.strip("•*- 0123456789.").split()
    if len(words) > max_words:
        summary_prompt = (
            f"Aşağıdaki sistem gereksinim cümlesini en fazla {max_words} kelimeyle özetle ve sadece özet cümleyi ver:\n"
            f"{line}"
        )
        summary = call_gemma3_api(summary_prompt, max_tokens=50)
        if summary:
            line = summary.strip().split("\n")[0]
    return line.strip(" .:-")


def generate_sgd_batch(chunk_text, count, avoid_list=None):
    """Tek LLM çağrısıyla metinden `count` adet BİRBİRİNDEN FARKLI SGD üretir (liste döner)."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-15:])
        avoid_block = f"\nŞu maddeler zaten üretildi, bunları TEKRAR ETME:\n{onceki}\n"
    prompt = (
        f"Aşağıdaki teknik şartname metnini incele ve metinden BİRBİRİNDEN FARKLI "
        f"{count} adet sistem gereksinimi (SGD) çıkar.\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Her madde tek, tam bir cümle olsun ve zorunluluk kipiyle bitsin (örn. 'sistem ... yapmalıdır').\n"
        f"- Açıklama, gerekçe veya ' - Bu gereksinim...' gibi ek cümle EKLEME; sadece gereksinim cümlesi.\n"
        f"- Her maddeyi AYRI bir satıra yaz.\n"
        f"- Satır başına numara, tire veya işaret KOYMA.\n"
        f"- Maddeler metindeki FARKLI konuları kapsasın, birbirini tekrar etmesin.\n"
        f"{avoid_block}\n"
        f"Metin:\n{chunk_text[:3500]}"
    )
    response = call_gemma3_api(prompt, max_tokens=min(count * 60 + 100, 700))
    if not response:
        return []
    META = ("işte", "aşağıda", "çıkarılmış", "çıkarılan", "gereksinimler:", "maddeler")
    items = []
    for line in response.strip().split("\n"):
        line = line.strip().strip("•*-").strip()
        line = re.sub(r"^\s*\d+[\.\)]\s*", "", line).strip(" .:-")
        # açıklama kuyruğunu (' - Bu gereksinim, ...') ve sonda takılı '-malı/-meli' artığını temizle
        line = re.sub(r"\s*[-–—]\s*(bu (gereksinim|madde|ister|özellik)|açıklama)\b.*$", "", line, flags=re.I)
        line = re.sub(r"(?<=\w)\s*[-–]\s*(malıdır|melidir|malı|meli)\b\.?$", "", line, flags=re.I).strip(" .:-")
        if not line or len(line.split()) <= 4:
            continue
        low = line.lower()
        if line.endswith(":") or any(m in low for m in META):
            continue
        items.append(line)
    return items


SGD_FILTER_LIST = [
    "istenilen sistem gereksinimi", "verilen metinden çıkarılabilecek sistem gereksinimi",
    "sistem gereksinimi", "sistem isteği", "gereksinim cümlesi", "gereksinim",
    "istenen gereksinim", "SGD", "istenen istek"
]


def save_sgd_list(sgd_list, base_name, save_dir, output_format="txt", project_name="Project"):
    """SGD listesini belirtilen formatta kaydeder."""
    if not sgd_list:
        return None
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_project_name = project_name.replace(" ", "_")
    filename = f"SGD_{safe_project_name}_{timestamp}.{output_format}"
    file_path = os.path.join(save_dir, filename)
    
    try:
        if output_format == "txt":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"SISTEM GEREKSINIM DOKUMANI (SGD) — {project_name}\n\n")
                for item in sgd_list:
                    f.write(f"{item['SGD_ID']} | {item['SGD_Aciklama']}\n")

        elif output_format == "pdf":
            c = canvas.Canvas(file_path, pagesize=A4)
            c.setFont("Times-Roman", 12)
            c.drawString(30, 800, f"SISTEM GEREKSINIM DOKUMANI (SGD) — {project_name}")
            y = 780
            for item in sgd_list:
                c.drawString(30, y, f"{item['SGD_ID']} | {item['SGD_Aciklama']}")
                y -= 20
                if y < 50:
                    c.showPage()
                    y = 800
            c.save()
        
        elif output_format == "excel":
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "SGD List"
            ws.append(["SGD ID", "SGD Açıklaması"])
            ws.append([f"Project: {project_name}", ""])
            for item in sgd_list:
                ws.append([item["SGD_ID"], item["SGD_Aciklama"]])
            wb.save(file_path)
        
        elif output_format == "html":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"<html><body><h1>SISTEM GEREKSINIM DOKUMANI (SGD) — {project_name}</h1><ul>")
                for item in sgd_list:
                    f.write(f"<li>{item['SGD_ID']} | {item['SGD_Aciklama']}</li>")
                f.write("</ul></body></html>")
        
        return file_path
    except Exception as e:
        raise Exception(f"Dosya kaydedilirken hata: {e}")

def generate_sgd_from_ur(ur_content, project_name="Proje", avoid_list=None):
    """Bir Kullanıcı Gereksiniminden (UR) 1 adet Sistem Gereksinimi (SGD) türetir."""
    import re, text_cleanup
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-10:])
        avoid_block = f"\nŞu SGD'ler zaten üretildi, FARKLI bir yönü ele al:\n{onceki}\n"
    prompt = (
        "Sen bir sistem mühendisisin. Görevin, verilen üst seviye KULLANICI GEREKSİNİMİNİ "
        "(User Requirement) sistemin ne yapması gerektiğini tanımlayan 1 adet SİSTEM "
        "GEREKSİNİMİNE (System Requirement) indirgemektir.\n\n"
        "--- ÖRNEK ---\n"
        "KULLANICI GEREKSİNİMİ: \"Kullanıcı farklı kahve türleri hazırlayabilmeli.\"\n"
        "SİSTEM GEREKSİNİMİ: \"Sistem; espresso, americano, latte ve cappuccino hazırlayabilmelidir.\"\n\n"
        f"KULLANICI GEREKSİNİMİ:\n\"{ur_content}\"\n"
        f"{avoid_block}\n"
        "Kurallar:\n"
        "- Türkçe, TEK cümle, teknik ve doğrulanabilir bir 'sistem ... -malıdır' gereksinimi.\n"
        "- Kullanıcı gereksinimini somut sistem davranışına çevir; kelime kelime kopyalama.\n"
        "- Üst maddede AÇIKÇA geçmeyen sayı/değer UYDURMA; yoksa (veya üst madde 'DSB' ise) 'DSB' yaz.\n"
        "- DSB'yi DAİMA tek başına yaz; sayıya/tireye/fiile YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB-malıdır'. DOĞRU: 'DSB saniye', 'DSB olmalıdır'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        "- Numara, başlık, etiket, açıklama EKLEME; sadece gereksinim cümlesi.\n"
    )
    response = call_gemma3_api(prompt, max_tokens=150)
    if not response:
        return None
    line = response.strip().split("\n")[0]
    line = re.sub(r"(?is)^\s*(s[İIı]stem gereks[İIı]n[İIı]m[İIı]?|sgd)\s*:?\s*", "", line)
    return text_cleanup.temizle(line)


def run_generation_from_requirements(requirement_list, max_sgds, project_name="Proje", status_callback=None):
    """
    İZLENEBİLİRLİK: Her Kullanıcı Gereksiniminden (UR) türeyen SGD'ler üretir.
    Üretilen her SGD, türediği UR'ye (Bound_TID) bağlanır. UR'ler arasında round-robin
    dağıtım yapılır → her UR en az bir SGD ile karşılanır (coverage).
    """
    if not requirement_list:
        return {"result": False, "message": "Kaynak gereksinim (UR) listesi boş."}
    n = len(requirement_list)
    hedef = max_sgds if (max_sgds and max_sgds > 0) else n
    sgd_list, existing = [], []
    i, guard = 0, 0
    while len(sgd_list) < hedef and guard < hedef * 4:
        guard += 1
        ur = requirement_list[i % n]; i += 1
        ur_id = ur.get("TID_ID") or ur.get("ID") or f"UR-{((i - 1) % n) + 1:03d}"
        ur_text = ur.get("TID_Aciklama") or ur.get("content") or ""
        if not ur_text:
            continue
        if status_callback:
            status_callback(f"({len(sgd_list)+1}/{hedef}) {ur_id} → SGD türetiliyor...")
        sgd = generate_sgd_from_ur(ur_text, project_name, avoid_list=existing)
        # MÜKERRER ENGELİ: aynı gereksinim iki kez üretilmesin
        if sgd and len(sgd.split()) > 4 and sgd.strip().lower() not in {e.strip().lower() for e in existing}:
            new_id = f"SR-{len(sgd_list)+1:03d}"
            sgd_list.append({"SGD_ID": new_id, "SGD_Aciklama": sgd, "Bound_TID": ur_id})
            existing.append(sgd)
            if status_callback:
                status_callback(f"✅SGD üretildi ({ur_id}→{new_id}): {sgd}")
    return {"result": True, "sgd_list": sgd_list, "message": "Başarılı"}


def run_generation_logic(
    file_paths,
    max_sgds,
    output_format="txt",
    project_name="Project",
    status_callback=None,
    precomputed_chunks=None,
    precomputed_indices=None
):
    """
    SGD üretimi ana fonksiyonu.
    precomputed_chunks ve precomputed_indices varsa onları kullanır → dosya okuma + embedding atlanır.
    """
    try:
        # ─────── HAZIR VERİ VARSA DOĞRUDAN KULLAN ───────
        if precomputed_chunks is not None and precomputed_indices is not None:
            all_chunks = precomputed_chunks
            sorted_indices = precomputed_indices
           
        else:
            # ─────── ESKİ USUL: Dosyaları oku ve embedding hesapla ───────
            all_chunks = []
            for file_path in file_paths:
                if status_callback:
                    status_callback(f"Dosya işleniyor: {os.path.basename(file_path)}")
                chunks = extract_book_chunks(file_path)
                if status_callback:
                    status_callback(f"✅{len(chunks)} adet chunk bulundu.")
                all_chunks.extend(chunks)

            if not all_chunks:
                if status_callback:
                    status_callback("Chunk bulunamadı.", is_error=True)
                return {"result": False, "message": "Chunk bulunamadı."}

            if status_callback:
                status_callback(f"✅Toplam {len(all_chunks)} adet chunk bulundu.")
                status_callback("🔗Chunk'lar embedding ile analiz ediliyor...")

            embeddings = get_chunk_embeddings(all_chunks)
            center = np.mean(embeddings, axis=0)
            similarities = [
                np.dot(e, center) / (np.linalg.norm(e) * np.linalg.norm(center))
                for e in embeddings
            ]
            sorted_indices = np.argsort(similarities)[::-1]

        # ─────── ORTAK ÜRETİM MANTIĞI ───────
        start_time = time.time()

        # İstenen ADEDE ulaşana kadar üret (parça az olsa bile adedi tamamlar).
        sgd_list = []
        existing_texts = []
        n = len(sorted_indices) if len(sorted_indices) else len(all_chunks)

        def _uygun(s):
            return (
                s
                and len(s.split()) > 4
                and not any(s.lower().strip(".: ") == filt for filt in SGD_FILTER_LIST)
                and s.lower().strip() not in [e.lower().strip() for e in existing_texts]
            )

        # 1) ÖNCE TOPLU (tek çağrıda N farklı madde)
        if status_callback:
            status_callback(f"SGD üretiliyor (hedef: {max_sgds} adet)...")
        top_text = "\n\n".join(
            all_chunks[sorted_indices[j % n] if len(sorted_indices) else (j % n)]
            for j in range(min(n, 3))
        )
        for sgd in generate_sgd_batch(top_text, max_sgds):
            if len(sgd_list) >= max_sgds:
                break
            if _uygun(sgd):
                sgd_list.append({"SGD_ID": f"SR-{len(sgd_list)+1:03d}", "SGD_Aciklama": sgd})
                existing_texts.append(sgd)
                if status_callback:
                    status_callback(f"✅SGD üretildi: {sgd}")

        # 2) EKSİK KALIRSA tek tek tamamla
        attempts = 0
        max_attempts = max(max_sgds * 5, 10)
        i = 0
        while len(sgd_list) < max_sgds and attempts < max_attempts:
            chunk = all_chunks[sorted_indices[i % n] if len(sorted_indices) else (i % n)]
            sgd = generate_sgd_from_chunk(chunk, avoid_list=existing_texts)
            attempts += 1
            i += 1
            if _uygun(sgd):
                sgd_list.append({"SGD_ID": f"SR-{len(sgd_list)+1:03d}", "SGD_Aciklama": sgd})
                existing_texts.append(sgd)
                if status_callback:
                    status_callback(f"✅SGD üretildi: {sgd}")

        duration = time.time() - start_time
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        if status_callback:
            status_callback(f"🕙Toplam süre: {minutes} dakika {seconds} saniye")

        return {"result": True, "sgd_list": sgd_list, "message": "Başarılı"}

    except Exception as e:
        if status_callback:
            status_callback(f"Hata: {str(e)}", is_error=True)
        return {"result": False, "message": str(e)}     

KEYWORDS_MAP = {
    "GIRIS": "amaç, kapsam, tanım, referans, özet, genel bakış, döküman amacı, sistem tanımı, versiyon, revizyon",
    "ARAYUZ": "arayüz, kullanıcı arayüzü, ui, hmi, ekran, buton, dokunmatik, iletişim protokolü, api, port, rs485, rs232, ethernet, can bus, modbus, profinet, usb",
    "DONANIM": "işlemci, cpu, microcontroller, bellek, ram, flash, rom, sensör, aktüatör, güç kaynağı, boyut, ağırlık, ip koruma, ip65, çalışma sıcaklığı, nem, titreşim, fiziksel özellik, montaj",
    "YAZILIM": "yazılım, işletim sistemi, os, rtos, firmware, gömülü yazılım, programlama dili, c, c++, python, kütüphane, sürücü, driver, algoritma, yazılım mimarisi",
    "PERFORMANS": "performans, hız, tepki süresi, döngü süresi, cycle time, doğruluk, hassasiyet, gecikme, latency, throughput, bps, mhz, khz, ms, sn, fps, başarı oranı, yük altında"
}

# sgd_generator_logic.py dosyasındaki classify_sgd_requirements fonksiyonunu TAMAMEN bununla değiştir:

# sgd_generator_logic.py dosyasındaki classify_sgd_requirements fonksiyonunu bununla değiştirin:

import re

def classify_single_sgd_item(sgd_text):
    prompt = (
        f"GÖREV: Bu Sistem Gereksinim maddesi hangi teknik alana girer? Sadece kategori ismini yaz.\n"
        f"MADDE: \"{sgd_text}\"\n\n"
        
        f"--- SEÇENEKLER ---\n"
        f"GIRIS (Amaç, kapsam)\n"
        f"ARAYUZ (GUI, Ekran, Buton, Protokol)\n"
        f"DONANIM (Fiziksel parça, Anten, İşlemci, Kutu, Kablo)\n"
        f"YAZILIM (Algoritma, Hesaplama, Veri İşleme, Kod)\n"
        f"PERFORMANS (Hız, Süre, Kapasite, Menzil)\n\n"
        
        f"CEVAP (Tek Kelime):"
    )
    
    response = call_gemma3_api(prompt, max_tokens=10, temperature=0.0)
    if not response: return "YAZILIM" # Varsayılan en güvenli liman
    
    ans = response.strip().upper()
    
    if "GIRIS" in ans or "GİRİŞ" in ans: return "GİRİŞ"
    if "ARAYUZ" in ans or "ARAYÜZ" in ans: return "ARAYÜZ GEREKSİNİMLERİ"
    if "DONANIM" in ans: return "DONANIM GEREKSİNİMLERİ"
    if "PERFORMANS" in ans: return "PERFORMANS GEREKSİNİMLERİ"
    
    return "YAZILIM GEREKSİNİMLERİ"

def classify_sgd_requirements(sgd_list, status_callback=None):
    if not sgd_list:
        return {"result": False, "message": "Liste boş."}

    categories = {
        "GİRİŞ": [],
        "ARAYÜZ GEREKSİNİMLERİ": [],
        "DONANIM GEREKSİNİMLERİ": [],
        "YAZILIM GEREKSİNİMLERİ": [],
        "PERFORMANS GEREKSİNİMLERİ": []
    }

    total = len(sgd_list)
    for idx, item in enumerate(sgd_list):
        sgd_id = item['SGD_ID']
        text = item['SGD_Aciklama'] # Orijinal tam metin
        
        if status_callback:
            status_callback(f"Sınıflandırılıyor ({idx+1}/{total}): {sgd_id}...")

        cat_name = classify_single_sgd_item(text)
        categories[cat_name].append(f"{sgd_id} | {text}")

    # --- ÇIKTI FORMATLAMA ---
    final_output = ""
    order = ["GİRİŞ", "ARAYÜZ GEREKSİNİMLERİ", "DONANIM GEREKSİNİMLERİ", 
             "YAZILIM GEREKSİNİMLERİ", "PERFORMANS GEREKSİNİMLERİ"]

    for cat in order:
        items = categories[cat]
        final_output += f"--- {cat} ---\n"
        
        if items:
            final_output += "\n".join(items) + "\n\n"
        else:
            final_output += "(Boş)\n\n"

    return {"result": True, "classified_text": final_output.strip()}