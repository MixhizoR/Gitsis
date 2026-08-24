'''import os
from docxtpl import DocxTemplate


def build_template_context(proje_ismi, flat_data):
    """
    flat_data'yı (AI'dan gelen düz veri) 
    docxtpl'in beklediği 'context' sözlüğüne dönüştürür.
    (Tüm TİD bölümlerinin liste olduğu basitleştirilmiş model)
    """
    
    context = {
        'proje_ismi': proje_ismi,
        
        'tids_amac': [],
        'tids_tanimlar': [],
        'tids_referanslar': [],
        'tids_sistem': [],
        'tids_yazilim_donanim': [],
        'tids_sertifikasyon': [],
        'tids_performans': [],
        
        'stt_test_senaryolari': [], 
        'dgö_ygö_listesi': [], 
        'dtt_ytt_senaryolari': [],
        'kmtd_test_senaryolari': [],
        'sitet_test_senaryolari': [],
        'dtet_ytet_test_sonuclari': [],
    }
    
    for item_id, item_data in flat_data.items():
        item_type = item_data.get('type', 'Bilinmeyen')
        
        list_item = {
            'id': item_id,
            'content': item_data.get('content', 'İçerik bulunamadı.')
        }

        if item_type == 'TID':
            category = item_data.get('category', '')
            if category == 'TID - Amaç ve Kapsam':
                context['tids_amac'].append(list_item)
            elif category == 'TID - Tanımlar ve Kısaltmalar':
                context['tids_tanimlar'].append(list_item)
            elif category == 'TID - Referans Belgeler':
                context['tids_referanslar'].append(list_item)
            elif category == 'TID - Sistem Gereksinimleri':
                context['tids_sistem'].append(list_item)
            elif category == 'TID - Yazılım ve Donanım Gereksinimleri':
                context['tids_yazilim_donanim'].append(list_item)
            elif category == 'TID - Sertifikasyon Gereksinimleri':
                context['tids_sertifikasyon'].append(list_item)
            elif category == 'TID - Performans Gereksinimleri':
                context['tids_performans'].append(list_item)
            else:
                context['tids_sistem'].append(list_item)
        
        elif item_type == 'STT': 
            context['stt_test_senaryolari'].append(list_item)
        elif item_type == 'DGÖ-YGÖ': 
            context['dgö_ygö_listesi'].append(list_item)
        elif item_type == 'DTT-YTT': 
            context['dtt_ytt_senaryolari'].append(list_item)
        elif item_type == 'KMTD': 
            context['kmtd_test_senaryolari'].append(list_item)
        elif item_type == 'SITET': 
            context['sitet_test_senaryolari'].append(list_item)
        elif item_type == 'DTET-YTET': 
            context['dtet_ytet_test_sonuclari'].append(list_item)
    
    return context


def save_şablon(file_path, template_path, proje_ismi, flat_data):
    """
    Verileri alıp, Döküman şablonu.docx'u doldurur ve kaydeder.
    Başarı durumunu (True/False) ve bir mesaj döner.
    """
    try:
        if not template_path:
            return (False, "Lütfen önce bir 'Şablon Dosyası (.docx)' seçin.")
        if not flat_data:
            return (False, "Şablona yerleştirilecek veri bulunamadı. Lütfen önce dokümanları üretin.")

        doc = DocxTemplate(template_path)
        context = build_template_context(proje_ismi, flat_data) 
        doc.render(context)
        doc.save(file_path)
        
        message = f"Doldurulan şablon başarıyla kaydedildi:\n{file_path}"
        return (True, message)
        
    except Exception as e:
        return (False, f"Şablon kaydedilirken kritik bir hata oluştu: {e}")'''