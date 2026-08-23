# -*- coding: utf-8 -*-
import os
import time
from llm_handler import call_gemma3_api
from config import CHUNK_SIZE, CHUNK_OVERLAP # Gerekmese de zararı yok

# --- Bu dosya artık PDF okumaz veya embedding yapmaz ---

def generate_sitet_from_sgd(requirement_content, project_name="Proje"):

    prompt = (
        f"Sen bir sistem test mühendisisin. Görevin, verilen SGD (Sistem Gereksinim Dökümanı) gereksinimini doğrulamak için spesifik bir SITET (Sistem İşletme Test Tanımı) senaryosu yazmaktır."

                f"--- ÖRNEK BAŞARILI TEST (BUNU YAP!) ---\n"
        f"GEREKSİNİM: \"Sistem, 3 saniye içinde hedefleri tespit etmelidir.\"\n"
        f"BAŞARILI TEST: \"Bilinen 5 adet test hedefi, sisteme enjekte edildiğinde, tüm hedeflerin 3 saniyelik zaman aşımı dolmadan arayüzde 'Tespit Edildi' olarak işaretlendiği doğrulanmalıdır.\"\n"
        f"(Açıklama: Bu test, 'nasıl' yapılacağını anlatan, özgün ve ölçülebilir bir senaryodur.)\n"
        
        f"Aşağıdaki SGD metnini incele ve bu metinden çıkarılabilecek Sistem İşletme Test Tanımı (SITET) üret:\n"
        f'"{requirement_content}"\n\n'
        f"Kurallar:\n"
        f"- Türkçe olmalı, SGD'nin aynısı olmamalı ve test adına daha fazla detay içermemeli.\n"
        f"- Sadece 1 cümlelik, teknik ve işlevsel bir SITET yaz.\n"
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
        print(f"[SITET Generator] LLM çağrısında hata: {e}")
        return None

def run_generation_from_requirements(requirement_list, project_name="Project", status_callback=None):
    """
    GUI (Arayüz.py) için ana SITET üretim mantığı.
    Bu fonksiyon 'max_sgds' (adet) değil, SGD listesini (requirement_list) alır.
    """
    
    if not requirement_list:
        if status_callback:
            status_callback("SITET üretimi için SGD listesi bulunamadı.", is_error=True)
        return {"result": False, "message": "Gereksinim listesi boş."}

    if status_callback:
        status_callback(f"SGD listesi alındı. ")

    start_time = time.time()
    sitet_list = [] # Üretilen SITET'leri burada toplayacağız

    # SGD listesindeki her bir gereksinim için döngü başlat
    for index, req_item in enumerate(requirement_list):
        try:
            sgd_id = req_item.get('SGD_ID', f"SR-{index+1:03d}")
            sgd_content = req_item.get('SGD_Aciklama', '')
            
            if not sgd_content:
                if status_callback:
                    status_callback(f"{sgd_id} için içerik boş, atlanıyor.", is_error=True)
                continue

            if status_callback:
                status_callback(f"({index+1}/{len(requirement_list)}) {sgd_id} için SITET üretiliyor...")
            
            # Her bir SGD için LLM'i çağır
            sitet_description = generate_sitet_from_sgd(sgd_content, project_name)
            
            if sitet_description and len(sitet_description.split()) > 5: # Çok kısa/hatalı cevapları filtrele
                new_sitet_id = f"SITET-{index+1:03d}"
                
                # --- KMTD'den Kopyalanan GEREKSİZ KARAKTERLERİ TEMİZLEME BLOĞU ---
                clean_description = sitet_description.strip(" .()[]")
                # Etiketleri SITET olarak güncelle
                clean_description = clean_description.replace("[SITET]", "").replace("[SITET-001]", "").strip()
                while clean_description and clean_description[0] in "([-" and clean_description[-1] in ")]":
                    clean_description = clean_description[1:-1].strip()
                # --- TEMİZLEME SONU ---

                # Arayüz'ün belediği formatta veriyi hazırla
                sitet_list.append({
                    "SITET_ID": new_sitet_id,
                    "SITET_Aciklama": clean_description, # ARTIK TEMİZ VERİ
                    "Bound_SGD": sgd_id  # Hangi SGD'ye bağlı olduğunu Arayüz'e bildir
                })
                
                # --- KMTD'den Kopyalanan GÜNCEL KONSOL MESAJI ---
                if status_callback:
                    status_callback(f"✅️{new_sitet_id} üretildi: {clean_description}")
            else:
                if status_callback:
                    status_callback(f"❌{sgd_id} için SITET üretilemedi veya yetersiz.", is_error=True)
        
        except Exception as e:
            if status_callback:
                status_callback(f"{sgd_id} işlenirken hata: {e}", is_error=True)
            continue # Bir hata olursa bile diğer SGD'ler için devam et

    duration = time.time() - start_time
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    status_callback(f"🕙 Toplam süre: {minutes} dakika {seconds}saniye")

    return {"result": True, "sitet_list": sitet_list, "message": "SITET üretimi başarılı."}