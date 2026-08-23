# -*- coding: utf-8 -*-
"""
Alt Sistem Testi (Subsystem Test) üretim mantığı.

V-Modelinin sağ bacağında yer alır ve girdi olarak SOL bacaktaki
Alt Sistem Gereksinimlerini (stt_generator_logic çıktısı) alır.
Her bir alt sistem gereksinimi için, onu doğrulayan ölçülebilir bir
test senaryosu (Geçti/Kaldı kriteri + doğrulama adımı) üretir.
Böylece Alt Sistem Gereksinimi -> Alt Sistem Testi izlenebilirliği kurulur.
"""
import re
import time
import text_cleanup
from llm_handler import call_gemma3_api


def generate_subsystem_test(requirement_content, project_name="Proje"):
    """Tek bir Alt Sistem Gereksinimi için 1 adet Alt Sistem Testi senaryosu üretir."""
    prompt = (
        "Sen bir alt sistem doğrulama (verification) test mühendisisin. "
        "Görevin, verilen Alt Sistem Gereksinimini (Subsystem Requirement) doğrulayan "
        "spesifik bir Alt Sistem Testi (Subsystem Test) senaryosu yazmaktır.\n\n"

        "--- ÖRNEK BAŞARILI TEST (BUNU YAP!) ---\n"
        "GEREKSİNİM: \"Sinyal işleme kartı, gelen veriyi 3 saniye içinde işlemelidir.\"\n"
        "BAŞARILI TEST: \"Karta bilinen bir test sinyali enjekte edilir; çıkış verisinin "
        "3 saniyeden kısa sürede üretildiği ölçülür. GEÇTİ KRİTERİ: işleme süresi < 3 sn.\"\n"
        "(Açıklama: 'nasıl' doğrulanacağını anlatan, ölçülebilir ve net Geçti/Kaldı kriteri olan bir senaryodur.)\n\n"

        "Aşağıdaki Alt Sistem Gereksinimini incele ve onu doğrulayan Alt Sistem Testi üret:\n"
        f'"{requirement_content}"\n\n'

        "Kurallar:\n"
        "- Türkçe olmalı.\n"
        "- Gereksinimin aynısı olmamalı; onu 'nasıl doğrularız' sorusuna cevap vermeli.\n"
        "- Ölçülebilir bir Geçti/Kaldı (Pass/Fail) kriteri içermeli.\n"
        "- Gereksinimde değer belirtilmemişse (veya 'DSB' ise) testte de sayı UYDURMA, 'DSB' yaz.\n"
        "- DSB'yi DAİMA tek başına yaz; sayıya/tireye YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB = 15 sn'. DOĞRU: 'DSB saniye'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        "- Sadece 1-2 cümlelik, teknik ve işlevsel bir test senaryosu yaz.\n"
        "- Numara, başlık veya ekstra açıklama ekleme.\n\n"
        "ALT SİSTEM TESTİ:"
    )

    try:
        response = call_gemma3_api(prompt, max_tokens=300)
        if not response:
            return None
        return response.strip()
    except Exception as e:
        print(f"[Alt Sistem Testi Generator] LLM çağrısında hata: {e}")
        return None


def run_generation_from_requirements(requirement_list, project_name="Project", status_callback=None):
    """
    Girdi: Alt Sistem Gereksinimleri listesi (stt_generator_logic çıktısı;
           her öğe STT_ID / STT_Aciklama anahtarlarını taşır).
    Çıktı: Her gereksinim için 1 Alt Sistem Testi (AST_ID / AST_Aciklama / Bound_STT).
    """
    if not requirement_list:
        if status_callback:
            status_callback("Alt Sistem Testi için Alt Sistem Gereksinimleri bulunamadı (Liste boş).", is_error=True)
        return {"result": False, "message": "Gereksinim listesi boş."}

    if status_callback:
        status_callback("Alt Sistem Gereksinimleri alındı.")

    start_time = time.time()
    ast_list = []

    for index, req_item in enumerate(requirement_list):
        try:
            req_id = req_item.get('STT_ID') or req_item.get('ID') or f"ASG-{index+1:03d}"
            req_content = req_item.get('STT_Aciklama') or req_item.get('content') or ''

            if not req_content:
                if status_callback:
                    status_callback(f"{req_id} için içerik boş, atlanıyor.", is_error=True)
                continue

            if status_callback:
                status_callback(f"({index+1}/{len(requirement_list)}) {req_id} için Alt Sistem Testi üretiliyor...")

            test_text = generate_subsystem_test(req_content, project_name)

            if test_text and len(test_text.split()) > 4:
                new_id = f"SST-{len(ast_list)+1:03d}"

                # --- Ortak temizleyici: etiket (ALT SİSTEM TESTİ:/BAŞARILI TEST:), numara, markdown ---
                clean_text = text_cleanup.temizle(test_text, test=True)
                # --- Temizleme sonu ---

                ast_list.append({
                    "AST_ID": new_id,
                    "AST_Aciklama": clean_text,
                    "Bound_STT": req_id
                })

                if status_callback:
                    status_callback(f"✅️{new_id} üretildi: {clean_text}")
            else:
                if status_callback:
                    status_callback(f"❌{req_id} için Alt Sistem Testi üretilemedi veya yetersiz.", is_error=True)

        except Exception as e:
            if status_callback:
                status_callback(f"{req_id} işlenirken hata: {e}", is_error=True)
            continue

    duration = time.time() - start_time
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    if status_callback:
        status_callback(f"🕙 Toplam süre: {minutes} dakika {seconds} saniye")

    return {"result": True, "ast_list": ast_list, "message": "Alt Sistem Testi üretimi başarılı."}
