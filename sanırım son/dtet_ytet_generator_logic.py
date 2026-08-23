# -*- coding: utf-8 -*-
import os
import time
from llm_handler import call_gemma3_api

def generate_dtet_ytet_from_dgoygo(requirement_content, project_name="Proje"):
    prompt = (
        f"Sen bir sistem test mühendisisin. Görevin, verilen DGÖ (Donanım-Geliştirme Özeti) gereksinimini doğrulamak için spesifik bir DTET (Donanım Testi) senaryosu yazmaktır."
        f"--- ÖRNEK BAŞARILI TEST (BUNU YAP!) ---\n"
        f"GEREKSİNİM: \"Sistem, 3 saniye içinde hedefleri tespit etmelidir.\"\n"
        f"BAŞARILI TEST: \"Bilinen 5 adet test hedefi, sisteme enjekte edildiğinde, tüm hedeflerin 3 saniyelik zaman aşımı dolmadan arayüzde 'Tespit Edildi' olarak işaretlendiği doğrulanmalıdır.\"\n"
        f"(Açıklama: Bu test, 'nasıl' yapılacağını anlatan, özgün ve ölçülebilir bir senaryodur.)\n"
        
        f"Aşağıdaki Donanım-Yazılım Geliştirme Özeti (DGÖ-YGÖ) metnini incele ve bu metinden çıkarılabilecek Donanım-Yazılım Test (DTET-YTET) dokümanı üret:\n"
        f'"{requirement_content}"\n\n'
        f"Kurallar:\n"
        f"- Türkçe olmalı, DGÖ-YGÖ'nün aynısı olmamalı ve test adına daha fazla detay içermemeli.\n"
        f"- Sadece 1 cümlelik, teknik ve işlevsel bir DTET-YTET (Donanım/Yazılım Testi) yaz.\n"
        f"- Gereksinimde değer belirtilmemişse (veya 'DSB' ise) testte de sayı UYDURMA, 'DSB' yaz.\n"
        f"- DSB'yi DAİMA tek başına yaz; sayıya/tireye YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB = 15 sn'. DOĞRU: 'DSB saniye'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle hiçbir şey ekleme.\n"
        f"- CÜMLE TEST CÜMLESİ OLSUN.\n\n"
    )
    
    try:
        response = call_gemma3_api(prompt, max_tokens=300)
        if not response:
            return None
        return response.strip()
    except Exception as e:
        print(f"[DTET-YTET Generator] LLM çağrısında hata: {e}")
        return None


def run_generation_from_requirements(requirement_list, project_name="Project", status_callback=None):
    """
    Ana arayüzden gelen DGÖ-YGÖ listesini işler ve her biri için DTET-YTET üretir.
    """
    if not requirement_list:
        if status_callback:
            status_callback("DTET-YTET üretimi için DGÖ-YGÖ listesi bulunamadı (Liste boş).", is_error=True)
        return {"result": False, "message": "Gereksinim listesi (DGÖ-YGÖ) boş."}

    if status_callback:
        status_callback(f"DGÖ-YGÖ listesi alındı.")

    start_time = time.time()
    test_list = [] # main.py bu ismi bekliyor

    for index, req_item in enumerate(requirement_list):
        try:
            # 1. ID ve İçerik Okuma (Farklı anahtar isimlerini destekle)
            dgoygo_id = req_item.get('ID') or req_item.get('DGÖ-YGÖ_ID') or f"DGÖ-{index+1}"
            dgoygo_content = req_item.get('Aciklama') or req_item.get('DGÖ-YGÖ_Aciklama') or req_item.get('content') or ''
            
            if not dgoygo_content:
                continue

            if status_callback:
                status_callback(f"({index+1}/{len(requirement_list)}) {dgoygo_id} için DTET-YTET üretiliyor...")

            # 2. LLM Çağrısı
            dtet_text = generate_dtet_ytet_from_dgoygo(dgoygo_content, project_name)
            
            if dtet_text and len(dtet_text.split()) > 3:
                new_id = f"HST-{len(test_list)+1:03d}"
                
                # Temizlik
                clean_text = dtet_text.strip(" .()[]").replace("Test Senaryosu:", "").strip()

                # 3. Listeye Ekleme (Standart 'ID' ve 'Aciklama' anahtarlarıyla)
                test_list.append({
                    "ID": new_id,
                    "Aciklama": clean_text,
                    "Bound_DGÖYGÖ": dgoygo_id
                })
                
                if status_callback:
                    status_callback(f"✅ {new_id} üretildi: {dgoygo_content}")
            else:
                if status_callback:
                    status_callback(f"❌ {dgoygo_id} için test üretilemedi.")
        
        except Exception as e:
            if status_callback:
                status_callback(f"Hata ({dgoygo_id}): {e}", is_error=True)
            continue

    duration = time.time() - start_time
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    
    # main.py 'test_list' bekliyor
    return {"result": True, "test_list": test_list, "message": "Başarılı"}