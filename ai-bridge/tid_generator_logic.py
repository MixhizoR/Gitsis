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
    
    # Chunking
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


def generate_tid_from_chunk(chunk_text, max_words=15, avoid_list=None):
    """Bir chunk'tan tek cümlelik TİD üretir. avoid_list verilirse ondan FARKLI bir madde üretir."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-12:])
        avoid_block = (
            f"\nAŞAĞIDAKİ MADDELER ZATEN ÜRETİLDİ; BUNLARI TEKRAR ETME, "
            f"metindeki BAŞKA/farklı bir gereksinimi seç:\n{onceki}\n"
        )
    prompt = (
        f"Aşağıdaki metni incele ve bu metinden çıkarılabilecek 1 adet kullanıcı gereksinimi (User Requirement) üret:\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Sadece 1 cümlelik, teknik ve işlevsel bir gereksinim yaz.\n"
        f"- Kaynak metinde AÇIKÇA geçmeyen sayı, süre veya değer UYDURMA; gerekiyorsa yerine 'DSB' yaz.\n"
        f"- DSB'yi DAİMA tek başına yaz; sayıya/tireye/fiile YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB-malıdır'. DOĞRU: 'DSB saniye', 'DSB olmalıdır'.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle ekleme.\n"
        f"- Sadece gereksinim cümlesini ver.\n"
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
            f"Aşağıdaki teknik gereksinim cümlesini en fazla {max_words} kelimeyle özetle ve sadece özet cümleyi ver:\n"
            f"{line}"
        )
        summary = call_gemma3_api(summary_prompt, max_tokens=50)
        if summary:
            line = summary.strip().split("\n")[0]
    return line.strip(" .:-")


def generate_tid_batch(chunk_text, count, avoid_list=None):
    """Tek LLM çağrısıyla metinden `count` adet BİRBİRİNDEN FARKLI TİD üretir (liste döner)."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-15:])
        avoid_block = f"\nŞu maddeler zaten üretildi, bunları TEKRAR ETME:\n{onceki}\n"
    prompt = (
        f"Aşağıdaki teknik şartname metnini incele ve metinden BİRBİRİNDEN FARKLI "
        f"{count} adet kullanıcı gereksinimi (User Requirement) çıkar.\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Her madde tek, tam bir cümle olsun ve zorunluluk kipiyle bitsin (örn. 'sistem ... yapmalıdır').\n"
        f"- Kaynak metinde AÇIKÇA geçmeyen sayı, süre veya değer UYDURMA; gerekiyorsa yerine 'DSB' yaz.\n"
        f"- DSB'yi DAİMA tek başına yaz; sayıya/tireye/fiile YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB-malıdır'. DOĞRU: 'DSB saniye', 'DSB olmalıdır'.\n"
        f"- Her maddeyi AYRI bir satıra yaz.\n"
        f"- Satır başına numara, tire veya işaret KOYMA.\n"
        f"- Maddeler metindeki FARKLI konuları kapsasın, birbirini tekrar etmesin.\n"
        f"{avoid_block}\n"
        f"Metin:\n{chunk_text[:3500]}"
    )
    response = call_gemma3_api(prompt, max_tokens=min(count * 60 + 100, 700))
    if not response:
        return []
    # Modelin giriş/başlık satırlarını ele ("İşte 3 gereksinim:", "Aşağıda...", vb.)
    META = ("işte", "aşağıda", "çıkarılmış", "çıkarılan", "gereksinimler:", "maddeler")
    items = []
    for line in response.strip().split("\n"):
        line = line.strip().strip("•*-").strip()
        # baştaki "1.", "2)" gibi numaraları temizle
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


TID_FILTER_LIST = [
    "istenilen teknik ister", "verilen metinden çıkarılabilecek teknik ister",
    "teknik ister", "teknik istek", "teknik gereksinim", "gereksinim cümlesi",
    "gereksinim", "istenen gereksinim", "TİD", "istenen istek"
]


def save_tid_list(tid_list, base_name, save_dir, output_format="txt", project_name="Project"):
    """TİD listesini belirtilen formatta kaydeder."""
    if not tid_list:
        return None
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_project_name = project_name.replace(" ", "_")
    filename = f"TID_{safe_project_name}_{timestamp}.{output_format}"
    file_path = os.path.join(save_dir, filename)
    
    try:
        if output_format == "txt":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"TECHNICAL REQUIREMENTS DOCUMENT (TRD) — {project_name}\n\n")
                for item in tid_list:
                    f.write(f"{item['TID_ID']} | {item['TID_Aciklama']}\n")
        
        elif output_format == "pdf":
            c = canvas.Canvas(file_path, pagesize=A4)
            c.setFont("Times-Roman", 12)
            c.drawString(30, 800, f"TECHNICAL REQUIREMENTS DOCUMENT (TRD) — {project_name}")
            y = 780
            for item in tid_list:
                c.drawString(30, y, f"{item['TID_ID']} | {item['TID_Aciklama']}")
                y -= 20
                if y < 50:
                    c.showPage()
                    y = 800
            c.save()
        
        elif output_format == "excel":
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "TID List"
            ws.append(["TID ID", "TID Açıklaması"])
            ws.append([f"Project: {project_name}", ""])
            for item in tid_list:
                ws.append([item["TID_ID"], item["TID_Aciklama"]])
            wb.save(file_path)
        
        elif output_format == "html":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"<html><body><h1>TECHNICAL REQUIREMENTS DOCUMENT (TRD) — {project_name}</h1><ul>")
                for item in tid_list:
                    f.write(f"<li>{item['TID_ID']} | {item['TID_Aciklama']}</li>")
                f.write("</ul></body></html>")
        
        return file_path
    except Exception as e:
        raise Exception(f"Dosya kaydedilirken hata: {e}")

def run_generation_logic(
    file_paths,
    max_tids,
    output_format="txt",
    project_name="Project",
    status_callback=None,
    precomputed_chunks=None,
    precomputed_indices=None
):
    """
    TİD üretimi ana fonksiyonu.
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
                    status_callback(f"✅️{len(chunks)} adet chunk bulundu.")
                all_chunks.extend(chunks)

            if not all_chunks:
                if status_callback:
                    status_callback("Chunk bulunamadı.", is_error=True)
                return {"result": False, "message": "Chunk bulunamadı."}

            if status_callback:
                status_callback(f"✅️Toplam {len(all_chunks)} adet chunk bulundu.")
                status_callback("Chunk'lar embedding ile analiz ediliyor...")

            embeddings = get_chunk_embeddings(all_chunks)
            center = np.mean(embeddings, axis=0)
            similarities = [
                np.dot(e, center) / (np.linalg.norm(e) * np.linalg.norm(center))
                for e in embeddings
            ]
            sorted_indices = np.argsort(similarities)[::-1]

        # ─────── ORTAK ÜRETİM MANTIĞI (her iki yolda da aynı) ───────
        start_time = time.time()

        # İstenen ADEDE ulaşana kadar üret. Parça (chunk) az olsa bile adedi tamamlar.
        tid_list = []
        existing_texts = []
        n = len(sorted_indices) if len(sorted_indices) else len(all_chunks)

        def _uygun(t):
            return (
                t
                and len(t.split()) > 4
                and not any(t.lower().strip(".: ") == filt for filt in TID_FILTER_LIST)
                and t.lower().strip() not in [e.lower().strip() for e in existing_texts]
            )

        # 1) ÖNCE TOPLU (tek çağrıda N farklı madde) — en üstteki parçaları birleştir
        if status_callback:
            status_callback(f"Kullanıcı Gereksinimi üretiliyor (hedef: {max_tids} adet)...")
        top_text = "\n\n".join(
            all_chunks[sorted_indices[j % n] if len(sorted_indices) else (j % n)]
            for j in range(min(n, 3))
        )
        for tid in generate_tid_batch(top_text, max_tids):
            if len(tid_list) >= max_tids:
                break
            if _uygun(tid):
                tid_list.append({"TID_ID": f"UR-{len(tid_list)+1:03d}", "TID_Aciklama": tid})
                existing_texts.append(tid)
                if status_callback:
                    status_callback(f"✅️Kullanıcı Gereksinimi üretildi: {tid}")

        # 2) EKSİK KALIRSA tek tek tamamla (öncekilerden farklı iste)
        attempts = 0
        max_attempts = max(max_tids * 5, 10)  # sonsuz döngü koruması
        i = 0
        while len(tid_list) < max_tids and attempts < max_attempts:
            chunk = all_chunks[sorted_indices[i % n] if len(sorted_indices) else (i % n)]
            tid = generate_tid_from_chunk(chunk, avoid_list=existing_texts)
            attempts += 1
            i += 1
            if _uygun(tid):
                tid_list.append({"TID_ID": f"UR-{len(tid_list)+1:03d}", "TID_Aciklama": tid})
                existing_texts.append(tid)
                if status_callback:
                    status_callback(f"✅️Kullanıcı Gereksinimi üretildi: {tid}")

        duration = time.time() - start_time
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        if status_callback:
            status_callback(f"Toplam süre: {minutes} dakika {seconds} saniye")

        return {"result": True, "tid_list": tid_list, "message": "Başarılı"}

    except Exception as e:
        if status_callback:
            status_callback(f"Hata: {str(e)}", is_error=True)
        return {"result": False, "message": str(e)}
import re # Düzenli ifadeler için (Temizlik yaparken lazım olacak)

# Anahtar kelimeler referans olarak kalsın ama prompt içinde daha basit kullanacağız
KEYWORDS_MAP = {
    "CEVRESEL": "sıcaklık, nem, ip65, boyut, ağırlık, malzeme, mil-std, fiziksel",
    "KABUL": "doğrulama, test sonucu, %, ±, tolerans, başarı, pass/fail",
    "KALITE": "mtbf, standart, iso, bakım, ömür, garanti, sertifika",
    "GIRIS": "amaç, kapsam, tanım, referans, özet",
    "MEVCUT": "mevcut sistem, sorun, eksiklik, gerekçe, darboğaz",
    "FONKSIYONEL": "yapmalı, etmeli, hesaplar, iletir, algılar, algoritma, arayüz"
}
def classify_single_tid_item(tid_text):
    """Tek bir TİD maddesinin kategorisini sorar."""
    prompt = (
        f"GÖREV: Aşağıdaki Kullanıcı Gereksinimi cümlesini analiz et ve sadece EN UYGUN kategori ismini döndür.\n"
        f"CÜMLE: \"{tid_text}\"\n\n"
        
        f"--- SEÇENEKLER (Sadece bunlardan birini yaz) ---\n"
        f"GIRIS\n"
        f"CEVRESEL\n"
        f"KABUL\n"
        f"KALITE\n"
        f"MEVCUT\n"
        f"FONKSIYONEL\n\n"
        
        f"--- İPUÇLARI ---\n"
        f"- 'Sıcaklık', 'Nem', 'Titreşim', 'Depolama' -> CEVRESEL\n"
        f"- 'Amaç', 'Kapsam', 'Tanımlar' -> GIRIS\n"
        f"- '% başarı', 'doğrulanmalıdır', 'test sonucu' -> KABUL\n"
        f"- 'Standart', 'ISO', 'MTBF', 'Bakım' -> KALITE\n"
        f"- 'Mevcut sistem yetersiz', 'İhtiyaç' -> MEVCUT\n"
        f"- Sistem ne yapacak? (Hesaplama, Algılama, Arayüz) -> FONKSIYONEL\n\n"
        
        f"CEVAP (Sadece tek kelime):"
    )
    
    response = call_gemma3_api(prompt, max_tokens=10, temperature=0.0) # Çok kısa ve net cevap istiyoruz
    if not response: return "FONKSIYONEL" # Varsayılan
    
    ans = response.strip().upper()
    if "GIRIS" in ans or "GİRİŞ" in ans: return "GİRİŞ"
    if "CEVRE" in ans or "ÇEVRE" in ans: return "ÇEVRESEL KOŞULLAR"
    if "KABUL" in ans: return "KABUL KRİTERLERİ"
    if "KALITE" in ans or "KALİTE" in ans: return "KALİTE VE STANDARTLAR"
    if "MEVCUT" in ans: return "MEVCUT SİSTEM VE İHTİYAÇ"
    
    return "FONKSİYONEL VE İŞLEVSEL GEREKSİNİMLER" # Diğer her şey buraya

def classify_existing_tid_list(tid_list, status_callback=None):
    if not tid_list:
        return {"result": False, "message": "Liste boş."}

    # Kategorileri tutacak sözlük
    categories = {
        "GİRİŞ": [],
        "ÇEVRESEL KOŞULLAR": [],
        "KABUL KRİTERLERİ": [],
        "KALİTE VE STANDARTLAR": [],
        "MEVCUT SİSTEM VE İHTİYAÇ": [],
        "FONKSİYONEL VE İŞLEVSEL GEREKSİNİMLER": []
    }

    total = len(tid_list)
    
    for idx, item in enumerate(tid_list):
        tid_id = item['TID_ID']
        text = item['TID_Aciklama'] # Orijinal metnin tamamı burada
        
        if status_callback:
            status_callback(f"Sınıflandırılıyor ({idx+1}/{total}): {tid_id}...")

        # Sadece kategori ismini soruyoruz, metni değiştirmiyoruz
        cat_name = classify_single_tid_item(text)
        
        # Orijinal ID ve TAM METNİ listeye ekliyoruz
        categories[cat_name].append(f"{tid_id} | {text}")

    # --- ÇIKTI FORMATLAMA ---
    final_output = ""
    order = [
        "GİRİŞ", "ÇEVRESEL KOŞULLAR", "KABUL KRİTERLERİ", 
        "KALİTE VE STANDARTLAR", "MEVCUT SİSTEM VE İHTİYAÇ", 
        "FONKSİYONEL VE İŞLEVSEL GEREKSİNİMLER"
    ]

    for cat in order:
        items = categories[cat]
        final_output += f"--- {cat} ---\n"
        
        if items:
            # Maddeler varsa hepsini alt alta yaz
            final_output += "\n".join(items) + "\n\n"
        else:
            # Madde yoksa (Boş) yaz
            final_output += "(Boş)\n\n"

    return {"result": True, "classified_text": final_output.strip()}