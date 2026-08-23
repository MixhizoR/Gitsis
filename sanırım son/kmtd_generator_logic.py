# -*- coding: utf-8 -*-
import os
import time
import text_cleanup
from llm_handler import call_gemma3_api
from config import CHUNK_SIZE, CHUNK_OVERLAP  # Gerekmese de zararı yok

def generate_kmtd_from_tid(requirement_content, project_name="Proje"):
    prompt = (
        f"Sen bir sistem test mühendisisin. Görevin, verilen Kullanıcı Gereksinimini (User Requirement) doğrulamak için spesifik bir Kabul Testi (Acceptance Test) senaryosu yazmaktır."
        
        f"--- ÖRNEK BAŞARILI TEST (BUNU YAP!) ---\n"
        f"GEREKSİNİM: \"Sistem, 3 saniye içinde hedefleri tespit etmelidir.\"\n"
        f"BAŞARILI TEST: \"Bilinen 5 adet test hedefi, sisteme enjekte edildiğinde, tüm hedeflerin 3 saniyelik zaman aşımı dolmadan arayüzde 'Tespit Edildi' olarak işaretlendiği doğrulanmalıdır.\"\n"
        f"(Açıklama: Bu test, 'nasıl' yapılacağını anlatan, özgün ve ölçülebilir bir senaryodur.)\n"
        
        f"Şimdi, bu BAŞARILI TEST mantığına uyarak aşağıdaki TİD için KMTD üret:\n\n"
        f"Aşağıdaki TİD metnini incele:\n"
        f'"{requirement_content}"\n\n'
        f"Kurallar:\n"
        f"- Türkçe olmalı, TİD'in aynısı olmamalı ve test adına daha fazla detay içermemeli.\n"
        f"- Sadece 1 cümlelik, teknik ve işlevsel bir KMTD yaz.\n"
        f"- Gereksinimde değer belirtilmemişse (veya 'DSB' ise) testte de sayı UYDURMA, 'DSB' yaz.\n"
        f"- DSB'yi DAİMA tek başına yaz; sayıya/tireye YAPIŞTIRMA. YANLIŞ: 'DSB-15 saniye', 'DSB = 15 sn'. DOĞRU: 'DSB saniye'. Aynı değerde hem DSB hem somut sayı KULLANMA.\n"
        f"- Numara, başlık, açıklama veya ekstra cümle hiçbir şey ekleme.\n"
        f"- CÜMLE TEST CÜMLESİ OLSUN.\n\n"
    )
    
    # LLM'i (Gemma 3) çağır
    try:
        response = call_gemma3_api(prompt, max_tokens=300)
        if not response:
            return None
        
        # Gelen cevabı temizle
        return response.strip()
        
    except Exception as e:
        print(f"[KMTD Generator] LLM çağrısında hata: {e}")
        return None


def run_generation_from_requirements(requirement_list, project_name="Project", status_callback=None):
    if not requirement_list:
        if status_callback:
            status_callback("KMTD üretimi için TİD listesi bulunamadı.", is_error=True)
        return {"result": False, "message": "Gereksinim listesi boş."}

    if status_callback:
        status_callback(f"TİD listesi alındı. ")

    start_time = time.time()
    kmtd_list = []

    for index, req_item in enumerate(requirement_list):
        try:
            tid_id = req_item.get('TID_ID', f"UR-{index+1:03d}")
            tid_content = req_item.get('TID_Aciklama', '')
            
            if not tid_content:
                if status_callback:
                    status_callback(f"{tid_id} için içerik boş, atlanıyor.", is_error=True)
                continue

            if status_callback:
                status_callback(f"({index+1}/{len(requirement_list)}) {tid_id} için KMTD üretiliyor...")

            # LLM'den KMTD metni al
            kmtd_description = generate_kmtd_from_tid(tid_content, project_name)
            
            if kmtd_description and len(kmtd_description.split()) > 5:  # Kısa veya hatalı cevapları filtrele
                new_kmtd_id = f"AT-{index+1:03d}"
                
                # --- Ortak temizleyici: etiket (KMTD:), numara (1.), markdown, echo ---
                clean_description = text_cleanup.temizle(kmtd_description, test=True)

                # Arayüz'ün beklediği formatta veriyi hazırla
                kmtd_list.append({
                    "KMTD_ID": new_kmtd_id,
                    "KMTD_Aciklama": clean_description,  # ARTIK TEMİZ VERİ
                    "Bound_TID": tid_id
                })
                
                if status_callback:
                    status_callback(f"✅️{new_kmtd_id} üretildi: {clean_description}")
            else:
                if status_callback:
                    status_callback(f"❌{tid_id} için KMTD üretilemedi veya yetersiz.", is_error=True)
        
        except Exception as e:
            if status_callback:
                status_callback(f"{tid_id} işlenirken hata: {e}", is_error=True)
            continue

    duration = time.time() - start_time
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    status_callback(f"🕙 Toplam süre: {minutes} dakika {seconds}saniye")

    return {"result": True, "kmtd_list": kmtd_list, "message": "KMTD üretimi başarılı."}