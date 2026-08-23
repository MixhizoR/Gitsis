import os
import fitz 
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


def generate_dgöygö_from_chunk(chunk_text, max_words=15, avoid_list=None):
    """Bir chunk'tan tek cümlelik Donanım/Yazılım Gereksinim Dökümanı (DGÖ-YGÖ) üretir. avoid_list verilirse ondan FARKLI bir madde üretir."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-12:])
        avoid_block = (
            f"\nAŞAĞIDAKİ MADDELER ZATEN ÜRETİLDİ; BUNLARI TEKRAR ETME, "
            f"metindeki BAŞKA/farklı bir gereksinimi seç:\n{onceki}\n"
        )
    prompt = (
        f"Aşağıdaki metni incele ve bu metinden çıkarılabilecek 1 adet Donanım/Yazılım Gereksinim Dökümanı (DGÖ-YGÖ) üret:\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Sadece 1 cümlelik, çok teknik ve işlevsel bir gereksinim yaz.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle ekleme.\n"
        f"- Sadece Donanım/Yazılım tasarım cümlesini ver.\n"
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


def generate_dgöygö_batch(chunk_text, count, avoid_list=None):
    """Tek LLM çağrısıyla metinden `count` adet BİRBİRİNDEN FARKLI DGÖ-YGÖ üretir (liste döner)."""
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-15:])
        avoid_block = f"\nŞu maddeler zaten üretildi, bunları TEKRAR ETME:\n{onceki}\n"
    prompt = (
        f"Aşağıdaki teknik şartname metnini incele ve metinden BİRBİRİNDEN FARKLI "
        f"{count} adet donanım/yazılım geliştirme gereksinimi (DGÖ-YGÖ) çıkar.\n"
        f"Kurallar:\n"
        f"- Türkçe olmalı.\n"
        f"- Her madde tek cümlelik, teknik bir donanım/yazılım tasarım gereksinimi olsun.\n"
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
        if not line or len(line.split()) <= 4:
            continue
        low = line.lower()
        if line.endswith(":") or any(m in low for m in META):
            continue
        items.append(line)
    return items


DGÖYGÖ_FILTER_LIST = [
    "istenilen donanım/yazılım gereksinim cümlesi",
    "verilen metinden çıkarılabilecek donanım/yazılım gereksinim cümlesi",
    "donanım/yazılım gereksinim cümlesi", "donanım isteği", "gereksinim cümlesi",
    "gereksinim", "istenen gereksinim", "DGÖ-YGÖ", "istenen istek"
]

def generate_dgöygö_from_ssr(ssr_content, project_name="Proje", avoid_list=None):
    """Bir Alt Sistem Gereksiniminden (SSR) 1 adet Donanım/Yazılım Geliştirme maddesi (HSD) türetir."""
    import re, text_cleanup
    avoid_block = ""
    if avoid_list:
        onceki = "\n".join(f"- {a}" for a in avoid_list[-10:])
        avoid_block = f"\nŞunlar zaten üretildi, FARKLI bir bileşeni ele al:\n{onceki}\n"
    prompt = (
        "Sen bir donanım/yazılım tasarım mühendisisin. Görevin, verilen ALT SİSTEM "
        "GEREKSİNİMİNİ (Subsystem Requirement) gerçekleştirecek 1 adet DONANIM/YAZILIM "
        "GELİŞTİRME maddesi yazmaktır: bu gereksinim hangi somut donanım bileşeni veya "
        "yazılım modülü ile karşılanacak?\n\n"
        "--- ÖRNEK ---\n"
        "ALT SİSTEM GEREKSİNİMİ: \"Demleme sıcaklığı 90-96°C aralığında tutulmalıdır.\"\n"
        "DONANIM/YAZILIM: \"Sistem, PID kontrollü bir ısıtıcı ve NTC sıcaklık sensörü ile "
        "demleme sıcaklığını 90-96°C aralığında düzenleyen bir sıcaklık kontrol modülü içermelidir.\"\n\n"
        f"ALT SİSTEM GEREKSİNİMİ:\n\"{ssr_content}\"\n"
        f"{avoid_block}\n"
        "Kurallar:\n"
        "- Türkçe, TEK cümle; somut bir donanım bileşeni veya yazılım modülü belirt.\n"
        "- Üst maddede AÇIKÇA geçmeyen sayı/değer UYDURMA; yoksa (veya üst madde 'DSB' ise) 'DSB' yaz.\n"
        "- DSB'yi DAİMA tek başına yaz; sayıya/tireye/fiile YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB-malıdır'. DOĞRU: 'DSB saniye', 'DSB olmalıdır'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        "- Numara, başlık, etiket, açıklama EKLEME; sadece tasarım cümlesi.\n"
    )
    response = call_gemma3_api(prompt, max_tokens=160)
    if not response:
        return None
    line = response.strip().split("\n")[0]
    line = re.sub(r"(?is)^\s*(donanım\s*/?\s*yazılım( geliştirme)?|dgö\s*-?\s*ygö|hsd)\s*:?\s*", "", line)
    return text_cleanup.temizle(line)


def run_generation_from_requirements(requirement_list, max_items, project_name="Proje", status_callback=None):
    """
    İZLENEBİLİRLİK: Her Alt Sistem Gereksiniminden (SSR) türeyen DGÖ-YGÖ üretir.
    Üretilen her madde, türediği SSR'ye (Bound_STT) bağlanır. Round-robin dağıtım.
    """
    if not requirement_list:
        return {"result": False, "message": "Kaynak gereksinim (SSR) listesi boş."}
    n = len(requirement_list)
    hedef = max_items if (max_items and max_items > 0) else n
    dgoygo_list, existing = [], []
    i, guard = 0, 0
    while len(dgoygo_list) < hedef and guard < hedef * 4:
        guard += 1
        ssr = requirement_list[i % n]; i += 1
        ssr_id = ssr.get("STT_ID") or ssr.get("ID") or f"SSR-{((i - 1) % n) + 1:03d}"
        ssr_text = ssr.get("STT_Aciklama") or ssr.get("content") or ""
        if not ssr_text:
            continue
        if status_callback:
            status_callback(f"({len(dgoygo_list)+1}/{hedef}) {ssr_id} → DGÖ-YGÖ türetiliyor...")
        dg = generate_dgöygö_from_ssr(ssr_text, project_name, avoid_list=existing)
        # MÜKERRER ENGELİ: aynı madde iki kez üretilmesin
        if dg and len(dg.split()) > 4 and dg.strip().lower() not in {e.strip().lower() for e in existing}:
            new_id = f"HSD-{len(dgoygo_list)+1:03d}"
            dgoygo_list.append({"ID": new_id, "Aciklama": dg, "Bound_STT": ssr_id})
            existing.append(dg)
            if status_callback:
                status_callback(f"✅DGÖ-YGÖ üretildi ({ssr_id}→{new_id}): {dg}")
    return {"result": True, "dgoygo_list": dgoygo_list, "message": "Başarılı"}


def run_generation_logic(
    file_paths,
    max_items,
    output_format="txt",
    project_name="Project",
    status_callback=None,
    precomputed_chunks=None,
    precomputed_indices=None
):
    """
    DGÖ-YGÖ üretimi ana fonksiyonu.
    """
    try:
        if precomputed_chunks is not None and precomputed_indices is not None:
            all_chunks = precomputed_chunks
            sorted_indices = precomputed_indices
        else:

            all_chunks = []
            if not file_paths:
                 return {"result": False, "message": "Dosya yolu veya chunk verisi sağlanmadı."}

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

        start_time = time.time()

        if max_items <= 0:
             return {"result": True, "dgoygo_list": [], "message": "İstenen sayı 0 olduğu için atlandı."}

        # İstenen ADEDE ulaşana kadar üret (parça az olsa bile adedi tamamlar).
        dgoygo_list = []
        existing_texts = []
        n = len(sorted_indices) if len(sorted_indices) else len(all_chunks)

        def _uygun(d):
            return (
                d
                and len(d.split()) > 4
                and not any(d.lower().strip(".: ") == filt for filt in DGÖYGÖ_FILTER_LIST)
                and d.lower().strip() not in [e.lower().strip() for e in existing_texts]
            )

        # 1) ÖNCE TOPLU (tek çağrıda N farklı madde)
        if status_callback:
            status_callback(f"DGÖ-YGÖ üretiliyor (hedef: {max_items} adet)...")
        top_text = "\n\n".join(
            all_chunks[sorted_indices[j % n] if len(sorted_indices) else (j % n)]
            for j in range(min(n, 3))
        )
        for dg_text in generate_dgöygö_batch(top_text, max_items):
            if len(dgoygo_list) >= max_items:
                break
            if _uygun(dg_text):
                dgoygo_list.append({"ID": f"HSD-{len(dgoygo_list)+1:03d}", "Aciklama": dg_text})
                existing_texts.append(dg_text)
                if status_callback:
                    status_callback(f"✅DGÖ-YGÖ üretildi: {dg_text}")

        # 2) EKSİK KALIRSA tek tek tamamla
        attempts = 0
        max_attempts = max(max_items * 5, 10)
        i = 0
        while len(dgoygo_list) < max_items and attempts < max_attempts:
            chunk = all_chunks[sorted_indices[i % n] if len(sorted_indices) else (i % n)]
            dg_text = generate_dgöygö_from_chunk(chunk, avoid_list=existing_texts)
            attempts += 1
            i += 1
            if _uygun(dg_text):
                dgoygo_list.append({"ID": f"HSD-{len(dgoygo_list)+1:03d}", "Aciklama": dg_text})
                existing_texts.append(dg_text)
                if status_callback:
                    status_callback(f"✅DGÖ-YGÖ üretildi: {dg_text}")

        duration = time.time() - start_time
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        
        return {"result": True, "dgoygo_list": dgoygo_list, "message": "Başarılı"}

    except Exception as e:
        if status_callback:
            status_callback(f"Hata: {str(e)}", is_error=True)
        return {"result": False, "message": str(e)}
    

DGO_KEYWORDS_MAP = {
    "PLANLAMA": "kapsam, strateji, zamanlama, kaynak, risk, hedef, öncelik",
    "TASARIM": "yöntem, yaklaşım, özellik, mimari, doğrulama yolu, analiz",
    "SENARYO": "adım, girdi, çıktı, beklenen sonuç, prosedür, durum, case, senaryo",
    "ORTAM": "donanım, simülatör, kablo, tool, konfigürasyon, version, setup",
    "KRITER": "başarı, hata, tolerans, pass, fail, limit, kabul, %"
}

def classify_single_dgo_item(dgo_text):
    """Tek bir DGÖ/YGÖ maddesinin IEEE 829 kategorisini sorar."""

    
    prompt = (
        f"GÖREV: Aşağıdaki teknik cümleyi analiz et ve IEEE 829 test standardına göre EN UYGUN kategoriyi seç.\n"
        f"CÜMLE: \"{dgo_text}\"\n\n"
        
        f"--- KATEGORİ SEÇİM KURALLARI ---\n"
        f"1. ORTAM (Test Environment): Eğer cümlede 'RAM', 'İşlemci', 'Bilgisayar', 'Mathcad', 'Simülatör', 'Kablo', 'Yazılım Aracı', 'Gereklidir' (donanım olarak) geçiyorsa bunu seç.\n"
        f"2. TASARIM (Test Design): Eğer cümlede 'Algoritma', 'Yöntem', 'Strateji', 'Mimari', 'Yaklaşım', 'Analiz yeteneği' anlatılıyorsa bunu seç.\n"
        f"3. KRITER (Pass/Fail Criteria): Eğer cümlede 'Doğruluk', 'Hata payı', 'Tolerans', 'Kabul edilebilir', 'Başarı' geçiyorsa bunu seç.\n"
        f"4. PLANLAMA (Test Plan): Eğer cümlede 'Zamanlama', 'Kapsam', 'Personel', 'Risk' geçiyorsa bunu seç.\n"
        f"5. SENARYO (Test Cases): Sadece yukarıdakilere uymayan, sistemin anlık bir eylemini veya adımını (Girdi/Çıktı) anlatan durumlar.\n\n"
        
        f"CEVAP (Sadece tek kelime: ORTAM, TASARIM, KRITER, PLANLAMA veya SENARYO):"
    )
    
    try:

        response = call_gemma3_api(prompt, max_tokens=10, temperature=0.0)
    except NameError:
        return "SENARYO"

    if not response: return "SENARYO"
    
    ans = response.strip().upper()
    
    if "ORTAM" in ans or "ENV" in ans: return "TEST ORTAMI VE KAYNAKLAR"
    if "TASARIM" in ans or "DESIGN" in ans: return "TEST TASARIMI VE YÖNTEM"
    if "KRITER" in ans or "KABUL" in ans: return "GEÇME/KALMA KRİTERLERİ"
    if "PLAN" in ans: return "TEST PLANI VE KAPSAM"
    
    return "TEST SENARYOLARI (CASES)"

def classify_existing_dgo_list(dgo_list, status_callback=None):
    if not dgo_list:
        return {"result": False, "message": "Liste boş."}


    categories = {
        "TEST PLANI VE KAPSAM": [],
        "TEST TASARIMI VE YÖNTEM": [],
        "TEST SENARYOLARI (CASES)": [],
        "TEST ORTAMI VE KAYNAKLAR": [],
        "GEÇME/KALMA KRİTERLERİ": []
    }

    total = len(dgo_list)
    
    for idx, item in enumerate(dgo_list):

        dgo_id = item.get('ID') or item.get('DGO_ID') or f"DGO-{idx+1}"
        
        text = ""
        possible_keys = ['Aciklama', 'DGO_Aciklama', 'content', 'text', 'description']
        for key in possible_keys:
            if item.get(key):
                text = item.get(key)
                break

        if not text:
            text = "[HATA: İçerik Bulunamadı]"

        if status_callback:
            status_callback(f"DGÖ Sınıflandırılıyor ({idx+1}/{total}): {dgo_id}...")

        if text == "[HATA: İçerik Bulunamadı]" or len(text) < 5:
            cat_name = "TEST SENARYOLARI (CASES)" 
        else:
            cat_name = classify_single_dgo_item(text)
        

        categories[cat_name].append(f"{dgo_id} | {text}")

    final_output = ""
    order = [
        "TEST PLANI VE KAPSAM", 
        "TEST TASARIMI VE YÖNTEM", 
        "TEST ORTAMI VE KAYNAKLAR",
        "TEST SENARYOLARI (CASES)", 
        "GEÇME/KALMA KRİTERLERİ"
    ]

    for cat in order:
        items = categories[cat]
        final_output += f"--- {cat} ---\n"
        
        if items:
            final_output += "\n".join(items) + "\n\n"
        else:
            final_output += "(Boş)\n\n"

    return {"result": True, "classified_text": final_output.strip()}