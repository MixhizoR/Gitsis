// ============================================================================
//  seedData.js  —  Ilk acilista yuklenecek ornek (demo) veri seti.
// ----------------------------------------------------------------------------
//  V-MODEL VERI SETI:
//  Aviyonik bir Ucus Kontrol / Otopilot Sistemi + Yer Destek Segmenti baz
//  alinarak kurgulanmistir. Yapinin mantigi:
//
//      [Sol kol]  10 Sistem Gereksinimi (REQ-SYS-xxx)
//                       |  ayristirma (decomposition)
//                       v
//                 46 Alt Gereksinim  ->  Yazilim (REQ-SW-xxx) + Donanim (REQ-HW-xxx)
//                 (Arayuz/HMI · Yazilim · Donanim · Veritabani · Sunucu ·
//                  Haberlesme · Guvenlik · Performans disiplinlerine dagilmis)
//                       |
//      [Sag kol]        v  dogrulama (verification)
//                 16 Test Senaryosu (REQ-TC-xxx)
//
//  Bazi gereksinimler BILEREK hicbir test senaryosuna baglanmadi; bunlar
//  "DO-178C Kapsam Raporu" ekraninda "Ucu acik / Kapsam disi" olarak cikar.
// ============================================================================
import { REQ_TYPE, PRIORITY, STATUS, DAL, CATEGORY, LINK_TYPE, CURRENT_USER } from '../utils/constants.js'

const now = '2026-06-20T09:00:00.000Z'
const U = CURRENT_USER

// Kompakt gereksinim fabrikasi (tum nesneler ayni semayi paylasir).
function R(id, text_id, title, type, category, priority, status, dal, description) {
  return {
    id,
    text_id,
    title,
    description,
    type,
    category,
    priority,
    status,
    dal_level: dal,
    createdAt: now,
    updatedAt: now,
    author: U,
  }
}

const T = REQ_TYPE
const C = CATEGORY
const P = PRIORITY
const S = STATUS

// ===========================================================================
//  1) SISTEM GEREKSINIMLERI (V'nin tepe seviyesi) — 10 adet
// ===========================================================================
const SYSTEM = [
  R('req_sys_001', 'REQ-SYS-001', 'Otopilot tepki suresi', T.SYSTEM, C.PERFORMANCE, P.HIGH, S.APPROVED, DAL.A,
    'Sistem, otopilot modundayken pilot komutuna 50 ms icinde tepki vermelidir.'),
  R('req_sys_002', 'REQ-SYS-002', 'Irtifa koruma', T.SYSTEM, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Sistem, secilen irtifayi +/- 10 metre toleransla otomatik olarak korumalidir.'),
  R('req_sys_003', 'REQ-SYS-003', 'Ariza durumunda guvenli mod', T.SYSTEM, C.SAFETY, P.HIGH, S.IN_REVIEW, DAL.A,
    'Sensor arizasi tespit edildiginde sistem 200 ms icinde guvenli moda gecmelidir.'),
  R('req_sys_004', 'REQ-SYS-004', 'Pilot arayuzu kritik uyari gosterimi', T.SYSTEM, C.HMI, P.MEDIUM, S.APPROVED, DAL.B,
    'Sistem, kritik uyarilari pilot ekraninda kirmizi renkte ve sesli alarmla 100 ms icinde gostermelidir.'),
  R('req_sys_005', 'REQ-SYS-005', 'Sensor (IMU) yedekliligi', T.SYSTEM, C.HARDWARE, P.HIGH, S.APPROVED, DAL.B,
    'Sistem, birincil ataletsel olcum birimi (IMU) ariza yaptiginda 50 ms icinde yedek IMU ile calismaya devam etmelidir.'),
  R('req_sys_006', 'REQ-SYS-006', 'Ucus verisi kaydi ve saklama', T.SYSTEM, C.DATABASE, P.MEDIUM, S.APPROVED, DAL.C,
    'Sistem, ucus parametrelerini en az 25 saat boyunca, saniyede 8 ornek cozunurlukle kalici olarak kaydetmelidir.'),
  R('req_sys_007', 'REQ-SYS-007', 'Yer istasyonu telemetri sunucusu', T.SYSTEM, C.SERVER, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Sistem, ucus telemetrisini yer istasyonuna saniyede en az 1 kez yayinlayan bir sunucu servisi saglamalidir.'),
  R('req_sys_008', 'REQ-SYS-008', 'Haberlesme veri butunlugu', T.SYSTEM, C.COMMS, P.HIGH, S.APPROVED, DAL.B,
    'Sistem, moduller arasi tum veri paketlerini CRC saglama toplami ile dogrulamali ve bozuk paketleri reddetmelidir.'),
  R('req_sys_009', 'REQ-SYS-009', 'Erisim yetkilendirme ve guvenligi', T.SYSTEM, C.SAFETY, P.MEDIUM, S.DRAFT, DAL.B,
    'Sistem yapilandirma arayuzune erisim, kullanici rolune gore yetkilendirilmeli ve guvenli olmalidir.'),
  R('req_sys_010', 'REQ-SYS-010', 'Kesintisiz guc ve yeniden baslatma', T.SYSTEM, C.HARDWARE, P.HIGH, S.APPROVED, DAL.A,
    'Ana guc kesildiginde sistem yedek guce gecmeli ve kritik islevler 100 ms icinde kesintisiz devam etmelidir.'),
]

// ===========================================================================
//  2) YAZILIM ALT GEREKSINIMLERI (REQ-SW-xxx) — 34 adet
//     Her satir: [ust sistem gereksinimi id, gereksinim nesnesi]
//     Ust id, Satisfies bagini otomatik uretmek icin kullanilir.
// ===========================================================================
const SW = [
  // --- SYS-001 Performans ---------------------------------------------------
  ['req_sys_001', R('req_sw_001', 'REQ-SW-001', 'Komut isleme dongusu', T.SOFTWARE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Otopilot yazilimi giris komutlarini 20 ms periyotlu gercek zamanli dongude islemelidir.')],
  ['req_sys_001', R('req_sw_002', 'REQ-SW-002', 'Giris orneklemesi', T.SOFTWARE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Yazilim, pilot giris sinyallerini 1 kHz (1 ms) cevrim hizinda orneklemelidir.')],
  ['req_sys_001', R('req_sw_003', 'REQ-SW-003', 'Uctan uca gecikme butcesi', T.SOFTWARE, C.PERFORMANCE, P.HIGH, S.IN_REVIEW, DAL.A,
    'Komut alindiktan eyleyici cikisina kadar gecen toplam yazilim gecikmesi 10 ms degerini asmamalidir.')],

  // --- SYS-002 Irtifa kontrol ----------------------------------------------
  ['req_sys_002', R('req_sw_004', 'REQ-SW-004', 'PID irtifa kontrolcusu', T.SOFTWARE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Yazilim, irtifa hatasini PID algoritmasi ile hesaplayip eyleyici komutu uretmelidir.')],
  ['req_sys_002', R('req_sw_005', 'REQ-SW-005', 'Irtifa hata hesaplayici', T.SOFTWARE, C.SOFTWARE, P.MEDIUM, S.APPROVED, DAL.B,
    'Yazilim, hedef irtifa ile olculen irtifa arasindaki farki her cevrimde guncellemelidir.')],
  ['req_sys_002', R('req_sw_006', 'REQ-SW-006', 'Eyleyici komut sinirlayici', T.SOFTWARE, C.SOFTWARE, P.MEDIUM, S.DRAFT, DAL.B,
    'Yazilim, uretilen eyleyici komutlarini guvenli mekanik limitler icinde sinirlandirmalidir.')],

  // --- SYS-003 Guvenli mod --------------------------------------------------
  ['req_sys_003', R('req_sw_007', 'REQ-SW-007', 'Sensor saglik izleme', T.SOFTWARE, C.SAFETY, P.HIGH, S.IN_REVIEW, DAL.A,
    'Yazilim, her sensor okumasinin gecerliligini menzil ve degisim orani kontrolu ile dogrulamalidir.')],
  ['req_sys_003', R('req_sw_008', 'REQ-SW-008', 'FDIR ariza tespit modulu', T.SOFTWARE, C.SAFETY, P.HIGH, S.APPROVED, DAL.A,
    'Yazilim, sensor arizasini tespit edildikten sonra 50 ms icinde isaretlemeli ve raporlamalidir.')],
  ['req_sys_003', R('req_sw_009', 'REQ-SW-009', 'Guvenli moda gecis yoneticisi', T.SOFTWARE, C.SAFETY, P.HIGH, S.APPROVED, DAL.A,
    'Yazilim, ariza isaretlendiginde sistemi onceden tanimli guvenli duruma 150 ms icinde gecirmelidir.')],
  ['req_sys_003', R('req_sw_010', 'REQ-SW-010', 'Capraz kanal karsilastirma', T.SOFTWARE, C.SOFTWARE, P.MEDIUM, S.DRAFT, DAL.B,
    'Yazilim, yedekli kanallarin ciktilarini karsilastirip sapma esigini astiginda uyari uretmelidir.')],

  // --- SYS-004 HMI ----------------------------------------------------------
  ['req_sys_004', R('req_sw_011', 'REQ-SW-011', 'Kritik uyari gorsel katmani', T.SOFTWARE, C.HMI, P.HIGH, S.APPROVED, DAL.B,
    'Yazilim, kritik uyarilari kirmizi renkte ve 100 ms icinde pilot ekraninin ust seridinde gostermelidir.')],
  ['req_sys_004', R('req_sw_012', 'REQ-SW-012', 'Sesli alarm modulu', T.SOFTWARE, C.HMI, P.MEDIUM, S.APPROVED, DAL.B,
    'Yazilim, kritik uyari olusunca 85 dB siddetinde kesikli sesli alarmi tetiklemelidir.')],
  ['req_sys_004', R('req_sw_013', 'REQ-SW-013', 'Uyari onceliklendirme kuyrugu', T.SOFTWARE, C.HMI, P.MEDIUM, S.DRAFT, DAL.B,
    'Yazilim, ayni anda olusan uyarilari onem derecesine gore siralayip kuyruklamalidir.')],
  ['req_sys_004', R('req_sw_014', 'REQ-SW-014', 'Ekran yenileme hizi', T.SOFTWARE, C.HMI, P.LOW, S.APPROVED, DAL.C,
    'Pilot gosterge ekrani en az 20 Hz (saniyede 20 kare) yenileme hizinda guncellenmelidir.')],
  ['req_sys_004', R('req_sw_015', 'REQ-SW-015', 'Kullanici dostu tema', T.SOFTWARE, C.HMI, P.LOW, S.DRAFT, DAL.D,
    'Arayuz modern, sezgisel ve kullanici dostu olmalidir.')], // BILEREK mugla -> AI analizinde dusuk skor

  // --- SYS-005 IMU yedekliligi ---------------------------------------------
  ['req_sys_005', R('req_sw_016', 'REQ-SW-016', 'IMU gecis (failover) mantigi', T.SOFTWARE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.B,
    'Yazilim, birincil IMU arizasinda 50 ms icinde yedek IMU verisine kesintisiz gecis yapmalidir.')],
  ['req_sys_005', R('req_sw_017', 'REQ-SW-017', 'IMU oylama (voting) algoritmasi', T.SOFTWARE, C.SOFTWARE, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Yazilim, uc ayri IMU okumasi arasindan ortanca degeri secerek sapan sensoru devre disi birakmalidir.')],

  // --- SYS-006 Veritabani / kayit ------------------------------------------
  ['req_sys_006', R('req_sw_018', 'REQ-SW-018', 'Ucus verisi kayit servisi', T.SOFTWARE, C.DATABASE, P.HIGH, S.APPROVED, DAL.C,
    'Yazilim, ucus parametrelerini saniyede 8 ornek hizinda kalici depolama katmanina yazmalidir.')],
  ['req_sys_006', R('req_sw_019', 'REQ-SW-019', 'Dairesel tampon yonetimi', T.SOFTWARE, C.DATABASE, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Yazilim, 25 saatlik kayit penceresi dolunca en eski veriyi otomatik olarak ust yazmalidir.')],
  ['req_sys_006', R('req_sw_020', 'REQ-SW-020', 'Kayit semasi ve indeksleme', T.SOFTWARE, C.DATABASE, P.LOW, S.DRAFT, DAL.D,
    'Yazilim, kayitlari zaman damgasina gore indeksleyerek 1 saniyeden kisa surede sorgulanabilir tutmalidir.')],
  ['req_sys_006', R('req_sw_021', 'REQ-SW-021', 'Veri sikistirma', T.SOFTWARE, C.DATABASE, P.LOW, S.DRAFT, DAL.D,
    'Yazilim, kayit verisini kayipsiz sikistirma ile en az %40 oraninda kuculttukten sonra saklamalidir.')],

  // --- SYS-007 Sunucu / altyapi --------------------------------------------
  ['req_sys_007', R('req_sw_022', 'REQ-SW-022', 'Telemetri yayin servisi', T.SOFTWARE, C.SERVER, P.HIGH, S.APPROVED, DAL.C,
    'Sunucu, telemetri paketlerini yer istasyonuna saniyede en az 1 kez yayinlamalidir.')],
  ['req_sys_007', R('req_sw_023', 'REQ-SW-023', 'REST API uc noktalari', T.SOFTWARE, C.SERVER, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Sunucu, gereksinim ve telemetri verisini JSON formatinda donduren REST uc noktalari sunmalidir.')],
  ['req_sys_007', R('req_sw_024', 'REQ-SW-024', 'Sunucu oturum yonetimi', T.SOFTWARE, C.SERVER, P.MEDIUM, S.DRAFT, DAL.C,
    'Sunucu, istemci oturumlarini benzersiz belirtec ile yonetmeli ve gecersiz oturumlari reddetmelidir.')],
  ['req_sys_007', R('req_sw_025', 'REQ-SW-025', 'Eszamanli istemci kapasitesi', T.SOFTWARE, C.SERVER, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Sunucu, en az 50 eszamanli istemciye performans kaybi olmadan hizmet verebilmelidir.')],

  // --- SYS-008 Haberlesme ---------------------------------------------------
  ['req_sys_008', R('req_sw_026', 'REQ-SW-026', 'CRC butunluk kontrolu', T.SOFTWARE, C.COMMS, P.HIGH, S.APPROVED, DAL.B,
    'Yazilim, gelen her paketin CRC-32 saglama toplamini dogrulamali, hatali paketi 1 ms icinde reddetmelidir.')],
  ['req_sys_008', R('req_sw_027', 'REQ-SW-027', 'ARINC-429 veri yolu surucusu', T.SOFTWARE, C.COMMS, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Yazilim, ARINC-429 veri yolunu 100 kbit/sn hizinda okuyup yazabilmelidir.')],
  ['req_sys_008', R('req_sw_028', 'REQ-SW-028', 'Yeniden iletim mekanizmasi', T.SOFTWARE, C.COMMS, P.MEDIUM, S.DRAFT, DAL.C,
    'Yazilim, dogrulanamayan paketi en fazla 3 kez yeniden talep etmeli, sonrasinda hata bildirmelidir.')],

  // --- SYS-009 Guvenlik / erisim -------------------------------------------
  ['req_sys_009', R('req_sw_029', 'REQ-SW-029', 'Kimlik dogrulama', T.SOFTWARE, C.SAFETY, P.HIGH, S.APPROVED, DAL.B,
    'Yazilim, yapilandirma arayuzune erisimden once kullanici adi ve parola dogrulamasi yapmalidir.')],
  ['req_sys_009', R('req_sw_030', 'REQ-SW-030', 'Rol tabanli yetkilendirme', T.SOFTWARE, C.SAFETY, P.HIGH, S.APPROVED, DAL.B,
    'Yazilim, kullanici islemlerini rolune (Sistem Muhendisi / Gelistirici) gore kisitlamalidir.')],
  ['req_sys_009', R('req_sw_031', 'REQ-SW-031', 'Degisiklik denetim kaydi', T.SOFTWARE, C.SAFETY, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Yazilim, gereksinim uzerindeki her degisikligi kullanici, tarih ve eski/yeni deger ile kaydetmelidir.')],
  ['req_sys_009', R('req_sw_032', 'REQ-SW-032', 'Oturum zaman asimi', T.SOFTWARE, C.SAFETY, P.LOW, S.DRAFT, DAL.D,
    'Yazilim, 10 dakika islemsiz kalan oturumu otomatik olarak sonlandirmalidir.')],

  // --- SYS-010 Guc ----------------------------------------------------------
  ['req_sys_010', R('req_sw_033', 'REQ-SW-033', 'Watchdog yeniden baslatma', T.SOFTWARE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Yazilim takilirsa watchdog zamanlayicisi sistemi 100 ms icinde guvenli sekilde yeniden baslatmalidir.')],
  ['req_sys_010', R('req_sw_034', 'REQ-SW-034', 'Guc durumu izleme', T.SOFTWARE, C.SOFTWARE, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Yazilim, ana ve yedek guc kaynaklarinin gerilim seviyesini surekli izleyip esik altinda uyari uretmelidir.')],
]

// ===========================================================================
//  3) DONANIM ALT GEREKSINIMLERI (REQ-HW-xxx) — 12 adet
//     Donanim gereksinimleri kapsam (coverage) analizine dahil degildir.
// ===========================================================================
const HW = [
  R('req_hw_001', 'REQ-HW-001', 'Gercek zamanli islemci', T.HARDWARE, C.HARDWARE, P.HIGH, S.APPROVED, DAL.A,
    'Donanim, otopilot dongusunu kacirmadan calistirabilen en az 500 MHz gercek zamanli islemci icermelidir.'),
  R('req_hw_002', 'REQ-HW-002', 'Yedekli IMU', T.HARDWARE, C.HARDWARE, P.HIGH, S.APPROVED, DAL.B,
    'Donanim, biri ariza yaptiginda devreye girecek iki bagimsiz ataletsel olcum birimi (IMU) icermelidir.'),
  R('req_hw_003', 'REQ-HW-003', 'Oylama (voter) devresi', T.HARDWARE, C.HARDWARE, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Donanim, uc sensor kanalini donanimsal oylama devresi ile karsilastirabilmelidir.'),
  R('req_hw_004', 'REQ-HW-004', 'Kati hal kayit bellegi', T.HARDWARE, C.DATABASE, P.MEDIUM, S.APPROVED, DAL.C,
    'Donanim, ucus kaydi icin en az 32 GB titresime dayanikli kati hal bellek saglamalidir.'),
  R('req_hw_005', 'REQ-HW-005', 'Yer istasyonu sunucu donanimi', T.HARDWARE, C.SERVER, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Yer istasyonu, telemetri sunucusunu calistiracak en az 8 cekirdek ve 16 GB RAM kapasitesine sahip olmalidir.'),
  R('req_hw_006', 'REQ-HW-006', 'Yedek batarya unitesi', T.HARDWARE, C.HARDWARE, P.HIGH, S.APPROVED, DAL.A,
    'Donanim, ana guc kesildiginde kritik islevleri en az 30 dakika besleyen yedek batarya icermelidir.'),
  R('req_hw_007', 'REQ-HW-007', 'Guc izleme devresi', T.HARDWARE, C.HARDWARE, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Donanim, besleme gerilimini 0.1 V cozunurlukle olcup yazilima bildiren bir izleme devresi icermelidir.'),
  R('req_hw_008', 'REQ-HW-008', 'ARINC-429 veri yolu', T.HARDWARE, C.COMMS, P.MEDIUM, S.APPROVED, DAL.B,
    'Donanim, moduller arasi haberlesme icin standart ARINC-429 cift telli veri yolu saglamalidir.'),
  R('req_hw_009', 'REQ-HW-009', 'Pilot gosterge ekrani (MFD)', T.HARDWARE, C.HMI, P.MEDIUM, S.APPROVED, DAL.B,
    'Donanim, gun isiginda okunabilir en az 1000 nit parlaklikta cok islevli gosterge ekrani saglamalidir.'),
  R('req_hw_010', 'REQ-HW-010', 'Sesli uyari hoparloru', T.HARDWARE, C.HMI, P.LOW, S.DRAFT, DAL.C,
    'Donanim, kokpit gurultu seviyesinin uzerinde duyulabilir sesli uyari hoparloru icermelidir.'),
  R('req_hw_011', 'REQ-HW-011', 'Sogutma ve sicaklik kontrolu', T.HARDWARE, C.HARDWARE, P.LOW, S.DRAFT, DAL.D,
    'Donanim yeterince guclu sogutulmali ve sicaklik makul seviyede tutulmalidir.'), // BILEREK mugla
  R('req_hw_012', 'REQ-HW-012', 'EMI/EMC blendaj', T.HARDWARE, C.HARDWARE, P.MEDIUM, S.IN_REVIEW, DAL.B,
    'Donanim, DO-160 standardina uygun elektromanyetik girisim (EMI) blendajina sahip olmalidir.'),
]

// ===========================================================================
//  4) TEST SENARYOLARI (REQ-TC-xxx) — 16 adet
// ===========================================================================
const TC = [
  R('req_tc_001', 'REQ-TC-001', 'Tepki suresi testi', T.TEST_CASE, C.PERFORMANCE, P.HIGH, S.APPROVED, DAL.A,
    'Komut enjekte edilir; eyleyici tepkisinin 50 ms icinde olustugu osiloskop ile dogrulanir.'),
  R('req_tc_002', 'REQ-TC-002', 'Irtifa koruma testi', T.TEST_CASE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Bozucu ruzgar profili uygulanir; irtifa sapmasinin +/- 10 m icinde kaldigi olculur.'),
  R('req_tc_003', 'REQ-TC-003', 'Komut dongusu zamanlama testi', T.TEST_CASE, C.SOFTWARE, P.MEDIUM, S.APPROVED, DAL.A,
    'Yazilim dongusunun 20 ms periyodu jitter analizi ile dogrulanir.'),
  R('req_tc_004', 'REQ-TC-004', 'PID kararlilik testi', T.TEST_CASE, C.SOFTWARE, P.HIGH, S.APPROVED, DAL.A,
    'Basamak girisi uygulanir; asim ve yerlesme suresi PID kararlilik kriterlerine gore olculur.'),
  R('req_tc_005', 'REQ-TC-005', 'Guvenli moda gecis suresi testi', T.TEST_CASE, C.SAFETY, P.HIGH, S.APPROVED, DAL.A,
    'Sensor arizasi enjekte edilir; guvenli moda gecisin 200 ms icinde tamamlandigi dogrulanir.'),
  R('req_tc_006', 'REQ-TC-006', 'FDIR ariza enjeksiyon testi', T.TEST_CASE, C.SAFETY, P.HIGH, S.IN_REVIEW, DAL.A,
    'Bilinen ariza desenleri enjekte edilir; FDIR modulunun 50 ms icinde arizayi isaretledigi dogrulanir.'),
  R('req_tc_007', 'REQ-TC-007', 'HMI kritik uyari gosterim testi', T.TEST_CASE, C.HMI, P.MEDIUM, S.APPROVED, DAL.B,
    'Kritik uyari tetiklenir; ekranda kirmizi gosterim ve sesli alarmin 100 ms icinde olustugu dogrulanir.'),
  R('req_tc_008', 'REQ-TC-008', 'Sesli alarm seviyesi testi', T.TEST_CASE, C.HMI, P.LOW, S.APPROVED, DAL.B,
    'Sesli alarm ses basinc seviyesi desibelmetre ile olculur; 85 dB esigi dogrulanir.'),
  R('req_tc_009', 'REQ-TC-009', 'IMU failover testi', T.TEST_CASE, C.HARDWARE, P.HIGH, S.APPROVED, DAL.B,
    'Birincil IMU devre disi birakilir; yedek IMU gecisinin 50 ms icinde kesintisiz oldugu dogrulanir.'),
  R('req_tc_010', 'REQ-TC-010', 'Ucus verisi kayit butunlugu testi', T.TEST_CASE, C.DATABASE, P.MEDIUM, S.APPROVED, DAL.C,
    '8 Hz kayit calistirilir; kaydedilen ornek sayisi ve zaman damgasi tutarliligi dogrulanir.'),
  R('req_tc_011', 'REQ-TC-011', 'Telemetri yayin testi', T.TEST_CASE, C.SERVER, P.MEDIUM, S.APPROVED, DAL.C,
    'Yer istasyonu baglanir; telemetri paketlerinin saniyede en az 1 kez ulastigi dogrulanir.'),
  R('req_tc_012', 'REQ-TC-012', 'Eszamanli istemci yuk testi', T.TEST_CASE, C.SERVER, P.MEDIUM, S.IN_REVIEW, DAL.C,
    '50 eszamanli istemci baglanir; yanit suresi ve paket kaybi kabul kriterlerine gore olculur.'),
  R('req_tc_013', 'REQ-TC-013', 'CRC paket bozulma testi', T.TEST_CASE, C.COMMS, P.HIGH, S.APPROVED, DAL.B,
    'Kasitli bozulmus paketler gonderilir; sistemin tumunu reddettigi dogrulanir.'),
  R('req_tc_014', 'REQ-TC-014', 'Yeniden iletim testi', T.TEST_CASE, C.COMMS, P.MEDIUM, S.IN_REVIEW, DAL.C,
    'Paket kaybi simule edilir; en fazla 3 yeniden iletim ve sonrasinda hata bildirimi dogrulanir.'),
  R('req_tc_015', 'REQ-TC-015', 'Kimlik dogrulama ve yetki testi', T.TEST_CASE, C.SAFETY, P.HIGH, S.APPROVED, DAL.B,
    'Gecersiz parola ve yetkisiz rol denenir; erisimin reddedildigi ve loglandigi dogrulanir.'),
  R('req_tc_016', 'REQ-TC-016', 'Guc kesintisi ve watchdog testi', T.TEST_CASE, C.HARDWARE, P.HIGH, S.APPROVED, DAL.A,
    'Ana guc kesilir; yedek guce gecis ve watchdog yeniden baslatmanin 100 ms icinde oldugu dogrulanir.'),
]

// Tum gereksinimleri tek listede birlestir.
export const SEED_REQUIREMENTS = [
  ...SYSTEM,
  ...SW.map(([, req]) => req),
  ...HW,
  ...TC,
]

// ===========================================================================
//  5) IZLENEBILIRLIK BAGLARI
// ===========================================================================
let lnkSeq = 0
const L = (fromId, toId, type) => ({
  id: `lnk_${String(++lnkSeq).padStart(3, '0')}`,
  fromId,
  toId,
  type,
  createdAt: now,
  createdBy: U,
})

// --- 5a) Satisfies: her yazilim alt gereksinimi ust sistem gereksinimini karsilar.
const satisfiesLinks = SW.map(([parentId, req]) => L(parentId, req.id, LINK_TYPE.SATISFIES))

// --- 5b) Verifies: test senaryolari ilgili gereksinim(ler)i dogrular.
//        [ust gereksinim id, test case id]
//        NOT: Asagida YER ALMAYAN sistem/yazilim gereksinimleri test edilmemis
//        kabul edilir ve Kapsam Raporu'nda "Ucu acik" cikar (orn. REQ-SYS-009).
const VERIFY_MAP = [
  ['req_sys_001', 'req_tc_001'],
  ['req_sw_001',  'req_tc_003'],
  ['req_sys_002', 'req_tc_002'],
  ['req_sw_004',  'req_tc_004'],
  ['req_sys_003', 'req_tc_005'],
  ['req_sw_009',  'req_tc_005'],
  ['req_sw_008',  'req_tc_006'],
  ['req_sys_004', 'req_tc_007'],
  ['req_sw_011',  'req_tc_007'],
  ['req_sw_012',  'req_tc_008'],
  ['req_sys_005', 'req_tc_009'],
  ['req_sw_016',  'req_tc_009'],
  ['req_sys_006', 'req_tc_010'],
  ['req_sw_018',  'req_tc_010'],
  ['req_sys_007', 'req_tc_011'],
  ['req_sw_022',  'req_tc_011'],
  ['req_sw_025',  'req_tc_012'],
  ['req_sys_008', 'req_tc_013'],
  ['req_sw_026',  'req_tc_013'],
  ['req_sw_028',  'req_tc_014'],
  ['req_sw_029',  'req_tc_015'],
  ['req_sw_030',  'req_tc_015'],
  ['req_sys_010', 'req_tc_016'],
  ['req_sw_033',  'req_tc_016'],
]
const verifiesLinks = VERIFY_MAP.map(([fromId, tcId]) => L(fromId, tcId, LINK_TYPE.VERIFIES))

export const SEED_LINKS = [...satisfiesLinks, ...verifiesLinks]

// ===========================================================================
//  6) BASLANGIC AUDIT KAYDI
// ===========================================================================
export const SEED_AUDIT = [
  {
    id: 'aud_seed_001',
    timestamp: now,
    user: U,
    action: 'SEED',
    entityType: 'system',
    entityId: '-',
    textId: '-',
    field: null,
    oldValue: null,
    newValue: null,
    message:
      'V-model demo veri seti yuklendi: 10 sistem gereksinimi, 34 yazilim + 12 donanim alt gereksinimi, 16 test senaryosu.',
  },
]
