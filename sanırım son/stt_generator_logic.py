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


def generate_stt_from_chunk(chunk_text, max_words=15):
    """Bir chunk'tan tek cümlelik Sistem Tanımlama Testi (STT) üretir."""
    prompt = (
        f"Aşağıdaki metni incele ve bu metinden çıkarılabilecek 1 adet Sistem Tanımlama Testi (STT) üret:\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Sadece 1 cümlelik, çok teknik ve işlevsel bir gereksinim yaz.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle ekleme.\n"
        f"- Sadece Sistem tanım testi cümlesini ver.\n\n"
        f"Metin:\n{chunk_text[:1000]}"
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


STT_FILTER_LIST = [
    "istenilen sistem tanım testi cümlesi",
    "verilen metinden çıkarılabilecek sistem tanım testi cümlesi",
    "sistem tanım testi cümlesi", "sistem isteği", "gereksinim cümlesi",
    "gereksinim", "istenen gereksinim", "STT", "istenen istek"
]


# ─────────────────────────────────────────────────────────────────────────────
#  ALT SİSTEM GEREKSİNİMLERİ (Subsystem Requirements)
#  V-Modelinin SOL bacağında yer alır. Girdi olarak üst seviye Sistem
#  Gereksinimlerini (SGD) alır ve bunları donanım/yazılım kısıtı içeren teknik
#  "yapmalı / etmeli (shall)" cümlelerine indirger. Böylece
#  SGD -> Alt Sistem Gereksinimi -> Alt Sistem Testi izlenebilirliği kurulur.
# ─────────────────────────────────────────────────────────────────────────────
def generate_subsystem_req_from_sgd(sgd_content, project_name="Proje"):
    """Tek bir SGD'den 1 adet Alt Sistem Gereksinimi (shall cümlesi) üretir."""
    prompt = (
        "Sen bir alt sistem tasarım mühendisisin. Görevin, verilen üst seviye "
        "Sistem Gereksinimini (SGD) donanım/yazılım seviyesine indirgeyen 1 adet "
        "Alt Sistem Gereksinimi (Subsystem Requirement) yazmaktır.\n\n"

        "--- ÖRNEK (BUNU YAP!) ---\n"
        "SİSTEM GEREKSİNİMİ: \"Sistem hedefleri gerçek zamanlı tespit etmelidir.\"\n"
        "ALT SİSTEM GEREKSİNİMİ: \"Sinyal işleme kartı, en az 100 MHz örnekleme "
        "frekansında çalışmalı ve tespit çıktısını 3 saniyeden kısa sürede üretmelidir.\"\n"
        "(Açıklama: üst gereksinimi somut donanım/yazılım kısıtına indirgeyen 'shall' cümlesidir.)\n\n"

        "Aşağıdaki Sistem Gereksinimini incele ve ondan bir Alt Sistem Gereksinimi türet:\n"
        f'"{sgd_content}"\n\n'

        "Kurallar:\n"
        "- Türkçe olmalı.\n"
        "- 'yapmalı', 'etmeli', 'sağlamalı', 'olmalı' gibi teknik bir shall cümlesi olmalı.\n"
        "- Donanım veya yazılım kısıtı içermeli (işlemci, bellek, arayüz, protokol, süre, frekans vb.).\n"
        "- SGD'nin kelime kelime aynısı olmamalı; onu somutlaştırmalı.\n"
        "- Üst maddede AÇIKÇA geçmeyen sayı/değer UYDURMA; yoksa (veya üst madde 'DSB' ise) 'DSB' yaz.\n"
        "- DSB'yi DAİMA tek başına yaz; sayıya/tireye/fiile YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB-malıdır'. DOĞRU: 'DSB saniye', 'DSB olmalıdır'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        "- Sadece 1 cümle. Numara, başlık veya açıklama ekleme.\n\n"
        "ALT SİSTEM GEREKSİNİMİ:"
    )

    try:
        response = call_gemma3_api(prompt, max_tokens=200)
        if not response:
            return None
        line = response.strip().split("\n")[0]
        # 'ALT SİSTEM GEREKSİNİMİ:' etiketini ve çevresindeki tırnakları temizle
        line = re.sub(r"^\s*ALT S[İIı]STEM GEREKS[İIı]N[İIı]M[İIı]\s*:?\s*", "", line, flags=re.I)
        return line.strip().strip('"').strip(" .:-")
    except Exception as e:
        print(f"[Alt Sistem Gereksinimi Generator] LLM çağrısında hata: {e}")
        return None


def run_generation_from_requirements(requirement_list, max_stts=0, project_name="Project", status_callback=None):
    """
    Girdi: Sistem Gereksinimleri (SGD) listesi. Her SGD için 1 Alt Sistem
    Gereksinimi üretir. max_stts > 0 ise en fazla o kadar üretim yapılır,
    0 ise tüm SGD'ler işlenir.
    Çıktı anahtarları (STT_ID / STT_Aciklama) geriye dönük uyumluluk için korunur;
    ayrıca izlenebilirlik için Bound_SGD eklenir.
    """
    if not requirement_list:
        if status_callback:
            status_callback("Alt Sistem Gereksinimi için Sistem Gereksinimleri (SGD) bulunamadı.", is_error=True)
        return {"result": False, "message": "Gereksinim listesi (SGD) boş."}

    if status_callback:
        status_callback("SGD listesi alındı.")

    start_time = time.time()
    stt_list = []

    for index, req_item in enumerate(requirement_list):
        if max_stts and len(stt_list) >= max_stts:
            break
        try:
            sgd_id = req_item.get('SGD_ID') or req_item.get('ID') or f"SR-{index+1:03d}"
            sgd_content = req_item.get('SGD_Aciklama') or req_item.get('content') or ''

            if not sgd_content:
                continue

            if status_callback:
                status_callback(f"({index+1}/{len(requirement_list)}) {sgd_id} için Alt Sistem Gereksinimi üretiliyor...")

            asg = generate_subsystem_req_from_sgd(sgd_content, project_name)

            if (
                asg
                and len(asg.split()) > 4
                and not any(asg.lower().strip(".: ") == filt for filt in STT_FILTER_LIST)
            ):
                new_id = f"SSR-{len(stt_list)+1:03d}"
                stt_list.append({
                    "STT_ID": new_id,
                    "STT_Aciklama": asg,
                    "Bound_SGD": sgd_id
                })
                if status_callback:
                    status_callback(f"✅️{new_id} üretildi: {asg}")
            else:
                if status_callback:
                    status_callback(f"❌{sgd_id} için Alt Sistem Gereksinimi üretilemedi.", is_error=True)

        except Exception as e:
            if status_callback:
                status_callback(f"{sgd_id} işlenirken hata: {e}", is_error=True)
            continue

    duration = time.time() - start_time
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    if status_callback:
        status_callback(f"🕙 Toplam süre: {minutes} dakika {seconds} saniye")

    return {"result": True, "stt_list": stt_list, "message": "Alt Sistem Gereksinimi üretimi başarılı."}


def save_stt_list(stt_list, base_name, save_dir, output_format="txt", project_name="Project"):
    """STT listesini belirtilen formatta kaydeder."""
    if not stt_list:
        return None
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_project_name = project_name.replace(" ", "_")
    filename = f"STT_{safe_project_name}_{timestamp}.{output_format}"
    file_path = os.path.join(save_dir, filename)
    
    try:
        if output_format == "txt":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"SİSTEM TANIM TESTİ (STT) — {project_name}\n\n")
                for item in stt_list:
                    f.write(f"{item['STT_ID']} | {item['STT_Aciklama']}\n")

        elif output_format == "pdf":
            c = canvas.Canvas(file_path, pagesize=A4)
            c.setFont("Times-Roman", 12)
            c.drawString(30, 800, f"SİSTEM TANIM TESTİ (STT) — {project_name}")
            y = 780
            for item in stt_list:
                c.drawString(30, y, f"{item['STT_ID']} | {item['STT_Aciklama']}")
                y -= 20
                if y < 50:
                    c.showPage()
                    y = 800
            c.save()
        
        elif output_format == "excel":
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "STT List"
            ws.append(["STT ID", "STT Açıklaması"])
            ws.append([f"Project: {project_name}", ""])
            for item in stt_list:
                ws.append([item["STT_ID"], item["STT_Aciklama"]])
            wb.save(file_path)
        
        elif output_format == "html":
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"<html><body><h1>SİSTEM TANIM TESTİ (STT) — {project_name}</h1><ul>")
                for item in stt_list:
                    f.write(f"<li>{item['STT_ID']} | {item['STT_Aciklama']}</li>")
                f.write("</ul></body></html>")
        
        return file_path
    except Exception as e:
        raise Exception(f"Dosya kaydedilirken hata: {e}")

def run_generation_logic(
    file_paths,
    max_stts,
    output_format="txt",
    project_name="Project",
    status_callback=None,
    precomputed_chunks=None,
    precomputed_indices=None
):
    """
    STT üretimi ana fonksiyonu.
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

        stt_list = []
        idx = 0
        while len(stt_list) < max_stts and idx < len(sorted_indices):
            chunk_idx = sorted_indices[idx]
            chunk = all_chunks[chunk_idx]
            if status_callback:
                status_callback(f"{len(stt_list)+1}/{max_stts}: STT üretiliyor...")
            stt = generate_stt_from_chunk(chunk)
            if (
                stt
                and len(stt.split()) > 4
                and not any(stt.lower().strip(".: ") == filt for filt in STT_FILTER_LIST)
            ):
                stt_list.append({"STT_ID": f"SSR-{len(stt_list)+1:03d}", "STT_Aciklama": stt})
                if status_callback:
                    status_callback(f"✅STT üretildi: {stt}")
            else:
                if status_callback:
                    status_callback("❌STT üretilemedi.")
            idx += 1

        # Eksik kalanları diğer chunk'lardan doldur
        if len(stt_list) < max_stts:
            for chunk_idx in range(len(all_chunks)):
                if chunk_idx in sorted_indices[:idx]:
                    continue
                chunk = all_chunks[chunk_idx]
                stt = generate_stt_from_chunk(chunk)
                if (
                    stt
                    and len(stt.split()) > 4
                    and not any(stt.lower().strip(".: ") == filt for filt in STT_FILTER_LIST)
                ):
                    stt_list.append({"STT_ID": f"SSR-{len(stt_list)+1:03d}", "STT_Aciklama": stt})
                    if status_callback:
                        status_callback(f"✅STT üretildi: {stt}")
                if len(stt_list) >= max_stts:
                    break

        duration = time.time() - start_time
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        if status_callback:
            status_callback(f"🕙Toplam süre: {minutes} dakika {seconds} saniye")

        return {"result": True, "stt_list": stt_list, "message": "Başarılı"}

    except Exception as e:
        if status_callback:
            status_callback(f"Hata: {str(e)}", is_error=True)
        return {"result": False, "message": str(e)}
    
    
KEYWORDS_MAP = {
    "GIRIS": "amaç, kapsam, tanım, referans, özet, genel bakış, döküman amacı, sistem tanımı, versiyon, revizyon, giriş, introduction, scope, purpose",
    "TEST_EDILECEK_OGELER": "test edilecek, test kapsamı, test items, özellikler, fonksiyonlar, gereksinim, özellik, feature to be tested, test edilmeyecek, not to be tested",
    "TEST_YAKLASIMI": "yaklaşım, strateji, test türü, test seviyesi, ortam, test ortamı, geçme kriteri, kalma kriteri, askıya alma, resumption, suspension, approach, strategy, pass/fail, criteria",
    "TEST_SENARYOLARI": "test senaryosu, test case, test durumu, test prosedürü, adım, giriş verisi, beklenen sonuç, önkoşul, test adımları, traceability, izlenebilirlik",
    "PLANLAMA_VE_SORUMLULUKLAR": "planlama, takvim, kaynak, personel, sorumluluk, risk, schedule, resources, responsibilities, risk, timeline, test ekibi"
}
import re

def classify_single_stt_item(stt_text):
    prompt = (
        f"GÖREV: Bu Alt Sistem Gereksinimi hangi teknik alana girer? Sadece kategori ismini yaz.\n"
        f"MADDE: \"{stt_text}\"\n\n"

        f"--- SEÇENEKLER ---\n"
        f"GIRIS (Amaç, kapsam)\n"
        f"DONANIM (Fiziksel parça, kart, işlemci, anten, güç, sensör)\n"
        f"YAZILIM (Algoritma, veri işleme, firmware, kod, gömülü yazılım)\n"
        f"ARAYUZ (Haberleşme protokolü, port, veri yolu, RS485, Ethernet, CAN)\n"
        f"PERFORMANS (Hız, süre, frekans, kapasite, gecikme)\n\n"

        f"CEVAP (Tek Kelime):"
    )

    response = call_gemma3_api(prompt, max_tokens=10, temperature=0.0)
    if not response: return "YAZILIM ALT SİSTEMİ"

    ans = response.strip().upper()

    if "GIRIS" in ans or "GİRİŞ" in ans: return "GİRİŞ"
    if "DONANIM" in ans: return "DONANIM ALT SİSTEMİ"
    if "ARAYUZ" in ans or "ARAYÜZ" in ans: return "ARAYÜZ / HABERLEŞME GEREKSİNİMLERİ"
    if "PERFORMANS" in ans: return "PERFORMANS / ZAMANLAMA GEREKSİNİMLERİ"

    return "YAZILIM ALT SİSTEMİ"

def classify_stt_requirements(stt_list, status_callback=None):
    if not stt_list:
        return {"result": False, "message": "Liste boş."}

    categories = {
        "GİRİŞ": [],
        "DONANIM ALT SİSTEMİ": [],
        "YAZILIM ALT SİSTEMİ": [],
        "ARAYÜZ / HABERLEŞME GEREKSİNİMLERİ": [],
        "PERFORMANS / ZAMANLAMA GEREKSİNİMLERİ": []
    }

    total = len(stt_list)
    for idx, item in enumerate(stt_list):
        stt_id = item['STT_ID']
        text = item['STT_Aciklama'] # Orijinal tam metin

        if status_callback:
            status_callback(f"Sınıflandırılıyor ({idx+1}/{total}): {stt_id}...")

        cat_name = classify_single_stt_item(text)
        categories[cat_name].append(f"{stt_id} | {text}")

    # --- ÇIKTI FORMATLAMA ---
    final_output = ""
    order = ["GİRİŞ", "DONANIM ALT SİSTEMİ", "YAZILIM ALT SİSTEMİ",
             "ARAYÜZ / HABERLEŞME GEREKSİNİMLERİ", "PERFORMANS / ZAMANLAMA GEREKSİNİMLERİ"]

    for cat in order:
        items = categories[cat]
        final_output += f"--- {cat} ---\n"
        
        if items:
            final_output += "\n".join(items) + "\n\n"
        else:
            final_output += "(Boş)\n\n"

    return {"result": True, "classified_text": final_output.strip()}