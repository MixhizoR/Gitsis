// ============================================================================
//  seed-coffee-project.mjs  —  "Espresso Bazli Kahve Otomati" ornek projesini
//  API uzerinden yaratir. Icerik, iki referans belgeye BIREBIR gore turetildi:
//    - coffe vending machine.pdf  (Nicel Gereksinim Dokumani, 58 gereksinim)
//    - Kategorize_Espresso_Testleri.pdf  (KT/ST/AST test matrisi, 32 test)
//
//  V-Model tureti:
//    Kullanici (12) -> Sistem (20) -> Alt-sistem: Yazilim (16) + Donanim (10)
//    Testler: Kabul/KT (8) / Sistem/ST (12) / Alt-sistem/AST (12)
//    Sozluk (14) + Roller (6) + Personel (5)
//    Baglar: Satisfies (yukari) + Verifies (test->gereksinim, COKLU dahil) +
//            Assigned To (sozluk->gereksinim)
//    Toplam bag: 47 Satisfies + 58 Verifies + 14 Assigned = 119
//
//  CALISTIRMA:
//    1) Backend'i baslat:  docker compose up  (http://localhost:4001 acik olmali)
//    2) Bu klasorde:       node scripts/seed-coffee-project.mjs
//    Not: IDEMPOTENT. Ayni isimli proje YOKSA sifirdan yaratir; VARSA "onarim"
//    moduna gecer -> mevcut nesnelere dokunmadan eksik baglari (ozellikle
//    Verifies) tamamlar; boylece kapsam skoru %100'e cikar. Elle ekledigin
//    bag/duzenlemeler korunur. Tekrar tekrar guvenle calistirilabilir.
//    PostgreSQL volume sayesinde veriler PC kapansa da kalicidir; sadece
//    "docker compose down -v" siler.
// ============================================================================

const BASE = process.env.API_BASE || 'http://localhost:4001/api'
const PROJECT_NAME = 'Espresso Bazli Kahve Otomati'

// --- HTTP yardimcisi --------------------------------------------------------
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.error || text}`)
  }
  return data
}
const post = (path, body) => api('POST', path, body)

// --- Taksonomi sabitleri (backend/src/constants.js ile ayni) ---------------
const REQ = {
  USER: 'User Requirement',
  SYSTEM: 'System Requirement',
  SOFTWARE: 'Software Requirement',
  HARDWARE: 'Hardware Requirement',
}
const TEST = {
  ACC: 'Acceptance Test',
  SYS: 'System Test',
  SUB: 'Sub-system Test',
}
const LINK = { SATISFIES: 'Satisfies', VERIFIES: 'Verifies', ASSIGNED: 'Assigned To' }
const PRI = { HIGH: 'High', MED: 'Medium', LOW: 'Low' }
const DAL = { A: 'DAL A', B: 'DAL B', C: 'DAL C', D: 'DAL D', E: 'DAL E' }
const STATUS = { PASS: 'Approved', FAIL: 'Rejected', REVIEW: 'In Review' }

// --- Izin bileson anahtar kumeleri (frontend permissions.js ile ayni) ------
const C_REQ = ['req-user', 'req-system', 'req-subsystem']
const C_TEST = ['test-acceptance', 'test-system', 'test-subsystem']
const C_ALL = [...C_REQ, ...C_TEST]
const C_SAT = ['req-system', 'req-subsystem'] // satisfies yukari akar: Kullanici kaynak olmaz

// 12 kademeli izin objesini kolayca kur. Verilmeyen anahtarlar kapali gelir.
function perms(spec = {}) {
  const scoped = {
    read: 'all', write: 'all', add_requirement: 'req', add_test: 'test',
    delete: 'all', link_satisfies: 'sat', link_verifies: 'test',
    link_assigned: 'req', approve: 'all',
  }
  const toggles = ['manage_roles', 'manage_projects', 'manage_fields']
  const out = {}
  for (const key of Object.keys(scoped)) {
    const v = spec[key]
    out[key] = v ? { enabled: true, components: v } : { enabled: false, components: [] }
  }
  for (const key of toggles) out[key] = { enabled: Boolean(spec[key]) }
  return out
}

// ============================================================================
//  VERI: Gereksinimler  — [localKey, title, description, field, priority, dal]
//  Aciklamalar referans PDF'ten birebir alinmistir.
// ============================================================================
const USER = [
  ['U1', '9 kahve secenegi menusu', 'Kullanici arayuz ekraninda tam olarak 9 adet kahve secenegi (Espresso, Doppio, Americano, Cappuccino, Latte, Mocha, Cortado, Flat White, Macchiato) bulunmalidir.', 'Arayuz / HMI', PRI.HIGH, DAL.C],
  ['U2', '5 seviyeli seker secimi', 'Makine, kahve secimi yapildiktan sonra kullaniciya "0,1,2,3,4" adet olmak uzere 5 farkli seker seviyesi sormali ve bu girdi alinmadan ogutme/dokum islemine baslamamalidir.', 'Arayuz / HMI', PRI.HIGH, DAL.C],
  ['U3', 'Azami dis ebat 350x450x500 mm', 'Makinenin dis ebatlari azami 350 mm (G) x 450 mm (D) x 500 mm (Y) olculerini asmamalidir.', 'Mekanik / Ergonomi', PRI.MED, DAL.D],
  ['U4', 'Azami bos agirlik 14.5 kg', 'Makinenin bos agirligi (su, sut ve kahve tozu haric) azami 14.5 kg olmalidir.', 'Mekanik / Ergonomi', PRI.MED, DAL.D],
  ['U5', 'Latte dokum suresi azami 85 sn', 'En yuksek hacimli icecegin (200 ml Latte) dokum islemi, kullanicinin seker onayindan itibaren en fazla 85.0 saniye icinde bardaga aktarilmis olmalidir.', 'Genel', PRI.HIGH, DAL.C],
  ['U6', 'Azami ses seviyesi 62 dB', 'Makine calisirken (pompa ve ogutucu aktifken) 1 metre uzaklikta olculen azami ses seviyesi 62.0 dB olmalidir.', 'Genel', PRI.MED, DAL.D],
  ['U7', 'Atik su tepsisi asgari 450 ml', 'Makinenin atik su tepsisi, bosaltma uyarisi verilmeden once en az 450 ml atik sivi depolayabilmelidir.', 'Mekanik / Ergonomi', PRI.LOW, DAL.D],
  ['U8', 'Aletsiz sokulebilir hazneler', 'Kullanici, sut tankini (asgari 1000 ml) ve kahve tozu haznesini (asgari 500 g) alet kullanmadan azami 15 saniye icinde yerinden cikarabilmelidir.', 'Mekanik / Ergonomi', PRI.MED, DAL.D],
  ['U9', 'Dokunmatik tepki azami 500 ms', 'Makine ekrani dokunmatik tepkime suresi, fiziksel temas ile gorsel tepki arasinda azami 500 milisaniye gecikme ile calismalidir.', 'Arayuz / HMI', PRI.MED, DAL.D],
  ['U10', '8 oz bardak yerlestirme acikligi', 'Dokum alani, 8 oz standart bardagi (90.9 mm yukseklik, 79.6 mm tepe capi) tek yatay hareketle yerlestirebilecek asgari 100 mm yukseklikte bir acikliga sahip olmalidir.', 'Mekanik / Ergonomi', PRI.HIGH, DAL.C],
  ['U11', 'Standby guc azami 5 W', 'Makine bekleme durumunda (Standby) prizden maksimum 5.0 W guc tuketmelidir.', 'Enerji Yonetimi', PRI.LOW, DAL.D],
  ['U12', 'Ana su tanki asgari 2000 ml', 'Ana su tanki kapasitesi asgari 2000 ml olmali ve su seviyesi 150 ml altina dusene kadar kullanici uyari almadan pes pese icecek alabilmelidir.', 'Hidrolik / Akiskan', PRI.MED, DAL.C],
]

const SYSTEM = [
  ['S1', 'Su sicakligi 92C +/-2C', 'Su isitma unitesi, icecek dokumu sirasinda su sicakligini 92C +/-2C araliginda sabit tutmalidir.', 'Isil Sistem', PRI.HIGH, DAL.B],
  ['S2', 'Sut sicakligi 65C +/-3C', 'Sut isitma ve kopurtme sistemi, bardaga dokulen sutun sicakligini 65C +/-3C araliginda tutmalidir.', 'Sut Sistemi', PRI.HIGH, DAL.C],
  ['S3', 'Seker dozaji 4.0 g/birim', 'Sistem, secilen her 1 birim seker icin bardaga net 4.0 g (+/-0.2 g) kristal seker dokumu yapmalidir.', 'Dozajlama', PRI.MED, DAL.C],
  ['S4', 'Espresso 30 ml', 'Espresso: Sistem tam 30 ml sivi kahve dokumu gerceklestirmelidir.', 'Hidrolik / Akiskan', PRI.HIGH, DAL.C],
  ['S5', 'Doppio 60 ml', 'Doppio: Sistem tam 60 ml sivi kahve dokumu gerceklestirmelidir.', 'Hidrolik / Akiskan', PRI.MED, DAL.C],
  ['S6', 'Americano 150 ml', 'Americano: Sistem, 30 ml Espresso uzerine 120 ml 92C sicak su ekleyerek toplam 150 ml dokum yapmalidir.', 'Hidrolik / Akiskan', PRI.MED, DAL.C],
  ['S7', 'Cappuccino 150 ml', 'Cappuccino: 30 ml Espresso, 60 ml sicak sut ve 60 ml sut kopugu olmak uzere toplam 150 ml dokum yapmalidir.', 'Sut Sistemi', PRI.MED, DAL.C],
  ['S8', 'Latte 200 ml', 'Latte: 30 ml Espresso, 150 ml sicak sut ve 20 ml sut kopugu olmak uzere toplam 200 ml dokum yapmalidir.', 'Sut Sistemi', PRI.MED, DAL.C],
  ['S9', 'Mocha (cikolatali)', 'Mocha: 30 ml Espresso, 15 g cikolata tozu, 50 ml sicak sut ve 20 ml sut kopugunu karistirarak dokum yapmalidir.', 'Sut Sistemi', PRI.MED, DAL.C],
  ['S10', 'Cortado 60 ml', 'Cortado: 30 ml Espresso ve 30 ml sicak sut olmak uzere toplam 60 ml dokum yapmalidir.', 'Sut Sistemi', PRI.LOW, DAL.C],
  ['S11', 'Flat White 180 ml', 'Flat White: 60 ml Espresso ve 120 ml sicak sut olmak uzere toplam 180 ml dokum yapmalidir.', 'Sut Sistemi', PRI.LOW, DAL.C],
  ['S12', 'Macchiato 45 ml', 'Macchiato: 30 ml Espresso ve 15 ml sut kopugu olmak uzere toplam 45 ml dokum yapmalidir.', 'Sut Sistemi', PRI.LOW, DAL.C],
  ['S13', 'Azami anlik guc 1450 W', 'Cihazin toplam anlik guc cekimi (su isiticisi, sut kopurtucu ve motorlar aktifken) azami 1450 W olmalidir.', 'Enerji Yonetimi', PRI.HIGH, DAL.B],
  ['S14', 'Uyku modu 600 sn', 'Sistem, sensorler 600 saniye boyunca kullanici temasi algilamadiginda guc tuketimini dusurerek otomatik uyku moduna gecmelidir.', 'Enerji Yonetimi', PRI.LOW, DAL.D],
  ['S15', 'Nozul-izgara mesafe 95-110 mm', 'Sivi dokum nozulu ile atik tepsisi izgarasi arasindaki dikey mesafe asgari 95.0 mm, azami 110.0 mm olmalidir.', 'Mekanik / Ergonomi', PRI.MED, DAL.D],
  ['S16', 'Akis hizi asgari 15 ml/sn', 'Sistem, sivilari hedef hacme ulastirmak icin asgari 15 ml/saniye akis hizina sahip bir sivi transfer hatti barindirmalidir.', 'Hidrolik / Akiskan', PRI.MED, DAL.C],
  ['S17', 'Kahve tozu porsiyon 6.0 g', 'Toz dozajlama sistemi, 1 shot Espresso (30 ml) icin tam 6.0 g (+/-0.5 g) kahve tozu (premix) porsiyonlamalidir.', 'Dozajlama', PRI.HIGH, DAL.C],
  ['S18', 'Isinma suresi azami 45 sn', 'Sistem acildiktan sonra suyun 20C oda sicakligindan 92C hedef sicakliga ulasmasi maksimum 45 saniye surmelidir.', 'Isil Sistem', PRI.MED, DAL.C],
  ['S19', 'Tasma siniri azami 230 ml', 'Sistem tarafindan uretilen hicbir icecek formulu toplamda 230 ml yi asmamali, 8 oz bardagin tasma sinirinin altinda kalmalidir.', 'Guvenlik / Emniyet', PRI.MED, DAL.C],
  ['S20', 'Damlama azami 2.0 ml', 'Icecek dokumu tamamlandiktan sonra cikis nozulundan tepsiye dusen sivi 5 saniye icinde azami 2.0 ml ile sinirli kalmalidir.', 'Hidrolik / Akiskan', PRI.LOW, DAL.D],
]

const SW = [
  ['W1', 'Seker secim promptu <=500 ms', 'Yazilim, kullanici bir kahve tipine dokundugunda maksimum 500 ms icinde "Seker Secim" arayuzunu (Prompt) ekrana getirmelidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W2', 'Seker secim timeout 15 sn', 'Seker secim ekrani 15.000 ms boyunca girdi almazsa yazilim islemi Timeout ile iptal edip ana ekrana donmelidir.', 'Yazilim / Kontrol', PRI.LOW, DAL.D],
  ['W3', 'Sut valfi PWM kontrolu', 'Yazilim, sut kopugu ve sicak sut oranini ayarlamak icin sut valfine (PWM) 0-255 sinyal gondermelidir (Kopuk PWM>200, Sicak sut PWM<100).', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W4', 'Recete dokum gecikmesi 2000 ms', 'Yazilim, Macchiato/Cappuccino gibi recetelerde sut kopugunun ustte kalmasi icin sivilarin dokumu arasina 2000 ms gecikme eklemelidir.', 'Yazilim / Kontrol', PRI.LOW, DAL.C],
  ['W5', 'Su seviyesi kilidi ERR-01', 'Yazilim, su tanki sensor degerini 150 ml altinda okudugunda ekranda "ERR-01" gostermeli ve dokum valflerini kilitlemelidir.', 'Yazilim / Kontrol', PRI.HIGH, DAL.C],
  ['W6', 'Seker adim motoru 200 step/birim', 'Yazilim, seker motorunu surmek icin her 4 gramlik dozaj (1 birim) basina adim motoruna tam 200 step (1 tur) komutu gondermelidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W7', 'Toz motoru 2500 ms', 'Yazilim, 6 g kahve tozu (1 shot) porsiyonlama emri icin toz dokum DC motorunu tam 2500 ms boyunca "HIGH" durumunda calistirmalidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W8', 'Sut bitti hatasi ERR-02', 'Yazilim, sut debimetresi degerini 3000 ms boyunca <10 ml/sn okursa ekranda "ERR-02 Sut Bitti" hatasi firlatmalidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W9', 'PID isitma dongusu 100 ms', 'Yazilim, termoblock PID isitma kontrolu icin sensor okumalarini ve rezistans PWM guncellemesini her 100 ms bir yinelemelidir.', 'Yazilim / Kontrol', PRI.HIGH, DAL.B],
  ['W10', 'Buton debounce 50 ms', 'Fiziksel ve dokunmatik butonlarin sinyal gurultusunu onlemek icin yazilimda 50 ms sekme engelleme (debounce) filtresi bulunmalidir.', 'Yazilim / Kontrol', PRI.LOW, DAL.D],
  ['W11', 'EEPROM son 50 hata kaydi', 'Yazilim, karsilasilan son 50 adet "ERR" kodunu tarih/saat pulu ile EEPROM belleginde saklamalidir.', 'Yazilim / Kontrol', PRI.LOW, DAL.D],
  ['W12', 'Pre-infusion 1500/2000 ms', 'Yazilim, kahve tozunu demlemeden once su pompasini 1500 ms calistirip 2000 ms duraklatmali, ardindan ana basincla dokume devam etmelidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W13', 'Ekran dimming 120 sn/%20', 'Ekran arka plan isigi, 120 saniye hareketsizlik sonrasi yazilim tarafindan %20 PWM seviyesine dusurulmelidir (Dimming).', 'Enerji Yonetimi', PRI.LOW, DAL.D],
  ['W14', 'Debimetre 450 pulse = 1 ml', 'Yazilim, su hacmini olcmek icin debimetreden gelen her 450 pulse kesmesini 1 mililitre olarak hesaplamalidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W15', 'Boot self-diagnostik 3000 ms', 'Yazilim, guc verildiginde 3000 ms boyunca "Marka Logosu" gostermeli ve arka planda I/O pin self-diagnostik testlerini yurutmelidir.', 'Yazilim / Kontrol', PRI.MED, DAL.C],
  ['W16', 'Temizlik cevrimi 5000 ms/%50 PWM', 'Temizlik cevrimi komutunda yazilim, sicak su valfini pes pese 5000 ms acip kapatan ve pompayi %50 PWM ile suren bir yikama dongusu isletmelidir.', 'Yazilim / Kontrol', PRI.LOW, DAL.D],
]

const HW = [
  ['H1', 'Titresimli pompa asgari 3.0 Bar', 'Su transfer pompasi, sicak suyu nozula tasimak icin asgari 3.0 Bar (0.3 MPa) calisma basinci uretebilen titresimli su pompasi olmalidir.', 'Hidrolik / Akiskan', PRI.HIGH, DAL.B],
  ['H2', 'Venturi sut valfi 5 ml/sn', 'Sut kopurtme valfi (Venturi), saniyede en az 5 ml sutu kopuk formuna donusturebilecek hava emis aerodinamik hacmine sahip olmalidir.', 'Sut Sistemi', PRI.MED, DAL.C],
  ['H3', 'Seker adim motoru >=2.0 kg-cm', 'Seker dokum mekanizmasini ceviren adim motoru, sikismalari engellemek icin asgari 2.0 kg-cm tutunma torkuna sahip olmalidir.', 'Donanim', PRI.MED, DAL.C],
  ['H4', 'PCB 10 role 250V/10A', 'Ana kontrol karti (PCB), 5V DC mantik voltaji ile calismali ve her biri 250V/10A tasiyabilen asgari 10 adet elektromekanik role barindirmalidir.', 'Donanim', PRI.HIGH, DAL.B],
  ['H5', 'Mikser motoru 12.000 RPM', 'Kahve tozu, sut ve sicak suyun homojen karisimini saglayan mikser motor dakikada tam 12.000 devir (RPM) donus hizina sahip olmalidir.', 'Donanim', PRI.MED, DAL.C],
  ['H6', 'Drip tray kilavuz 60 mm', 'Bardak yerlestirme tepsisi (Drip Tray), 8 oz bardagin hizalanmasi icin merkezden disa en az 60.0 mm capinda dairesel kilavuz alanina sahip olmalidir.', 'Mekanik / Ergonomi', PRI.LOW, DAL.D],
  ['H7', 'TFT LCD 5 inc 800x480', 'Kullanici arayuz ekrani, kosegeni asgari 5.0 inc ve cozunurlugu en az 800x480 piksel TFT LCD donanima sahip olmalidir.', 'Arayuz / HMI', PRI.MED, DAL.C],
  ['H8', 'Thermoblock 1200 W (+/-50 W)', 'Suyu isitan thermoblock unitesinin ic rezistans guc kapasitesi tam olarak 1200 W (+/-50 W) olmalidir.', 'Isil Sistem', PRI.HIGH, DAL.B],
  ['H9', 'Load Cell 0-500 g (+/-1 g)', 'Atik su tepsisinin altindaki tasma algilama agirlik sensoru (Load Cell) 0-500 g okuma kapasitesine ve +/-1 g hassasiyete sahip olmalidir.', 'Donanim', PRI.LOW, DAL.D],
  ['H10', 'Hall-Effect debimetre 450 pulse/L', 'Su borusuna entegre debimetre, 1 litre akista 450 pulse kare dalga sinyali ureten Hall-Effect sensoru barindirmalidir.', 'Donanim', PRI.MED, DAL.C],
]

// ============================================================================
//  VERI: Testler  — [localKey, title, description, field, priority, dal, status]
// ============================================================================
const ACC_TESTS = [
  ['A1', 'KT-01 Arayuz secenekleri ve seker girdisi', 'Ekrandaki 9 kahve turunu dogrula; secim sonrasi seker onayi gelmeden ogutme/dokum baslamadigini onayla.', 'Arayuz / HMI', PRI.HIGH, DAL.C, STATUS.PASS],
  ['A2', 'KT-02 Fiziksel sinirlar ve agirlik', 'Cihazin 350x450x500 mm sinirlarini serit metreyle, bos agirligini kantarla olc; ebat asilmamali, agirlik <=14.5 kg olmali.', 'Mekanik / Ergonomi', PRI.MED, DAL.D, STATUS.PASS],
  ['A3', 'KT-03 Dokum suresi ve bardak ergonomisi', '200 ml Latte siparisi verip kronometre tut; 8 oz bardak >=100 mm acikliga rahat sigmali, Latte onaydan sonra maks 85 sn surmeli.', 'Mekanik / Ergonomi', PRI.HIGH, DAL.C, STATUS.PASS],
  ['A4', 'KT-04 Operasyonel akustik seviye', 'Makine tam kapasite calisirken 1 metre mesafeden desibel olc; ses azami 62.0 dB olmalidir.', 'Genel', PRI.MED, DAL.D, STATUS.REVIEW],
  ['A5', 'KT-05 Atik su tepsisi kapasitesi', 'Atik tepsisine dereceli silindirle sivi doldur; tepsi uyari vermeden en az 450 ml depolayabilmelidir.', 'Mekanik / Ergonomi', PRI.LOW, DAL.D, STATUS.PASS],
  ['A6', 'KT-06 Moduler parcalarin kullanilabilirligi', 'Sut tankini (min 1000 ml) ve toz haznesini (min 500 g) aletsiz sokmeyi dene; her ikisi de maks 15 sn icinde cikarilabilmelidir.', 'Mekanik / Ergonomi', PRI.MED, DAL.D, STATUS.PASS],
  ['A7', 'KT-07 Ekran dokunmatik gecikme testi', 'Dokunmatik ekrana temas edip agir cekim kamerayla tepki suresini olc; gecikme azami 500 ms olmalidir.', 'Arayuz / HMI', PRI.MED, DAL.D, STATUS.PASS],
  ['A8', 'KT-08 Bekleme gucu ve su tanki kesintisiz kullanim', 'Standby modunda wattmetre ile guc cekimini olc; 2000 ml tanktan 150 ml ye inene kadar pes pese icecek al. Guc <=5.0 W olmali.', 'Enerji Yonetimi', PRI.MED, DAL.C, STATUS.REVIEW],
]

const SYS_TESTS = [
  ['SY1', 'ST-01 Isinma hizi ve termal kararlilik', 'Cihazi 20C odada acip 92C ye ulasma suresini olc; su/sut sicakliklarini termokupl ile kontrol et. Isinma maks 45 sn, su 92C+/-2, sut 65C+/-3.', 'Isil Sistem', PRI.HIGH, DAL.B, STATUS.PASS],
  ['SY2', 'ST-02 Temel dozajlama kalibrasyonu', '1 birim seker ve 1 shot premix kahve tozunu hassas terazi ile tart; seker 4.0 g (+/-0.2), toz 6.0 g (+/-0.5) olmali.', 'Dozajlama', PRI.MED, DAL.C, STATUS.PASS],
  ['SY3', 'ST-03 Temel espresso hacimleri', 'Espresso ve Doppio dokumlerini dereceli silindire alarak olc; Espresso 30 ml, Doppio 60 ml olmali.', 'Hidrolik / Akiskan', PRI.MED, DAL.C, STATUS.PASS],
  ['SY4', 'ST-04 Americano ve Cappuccino karisim oranlari', 'Americano su ilavesini (120 ml) ve Cappuccino kopuk/sut/espresso dagilimini analiz et; her ikisi de tam 150 ml olmali.', 'Sut Sistemi', PRI.MED, DAL.C, STATUS.PASS],
  ['SY5', 'ST-05 Latte ve Mocha karmasiklik testi', 'Latte ve Mocha dokum hacimlerini olc, Mocha cikolata karisimini gozlemle; Latte 200 ml, Mocha formulu eksiksiz olusmali.', 'Sut Sistemi', PRI.MED, DAL.C, STATUS.REVIEW],
  ['SY6', 'ST-06 Sut odakli kisa/uzun icecekler', 'Cortado (60 ml), Flat White (180 ml) ve Macchiato (45 ml) recetelerinin sivi dagilimlarini test et; hedef hacimlerde olmali.', 'Sut Sistemi', PRI.LOW, DAL.C, STATUS.PASS],
  ['SY7', 'ST-07 Zirve guc cekimi', 'Su isiticisi, sut kopurtucu ve motorlar ayni anda devredeyken guc olc; toplam anlik guc azami 1450 W olmali.', 'Enerji Yonetimi', PRI.HIGH, DAL.B, STATUS.PASS],
  ['SY8', 'ST-08 Otomatik uyku gecisi', 'Makineyi rolantide birakip 600 sn hicbir sensoru tetikleme; sistem uyku moduna gecmelidir.', 'Enerji Yonetimi', PRI.LOW, DAL.D, STATUS.PASS],
  ['SY9', 'ST-09 Nozul ve izgara mesafesi geometrisi', 'Sivi dokum nozulu ucu ile atik tepsisi izgarasi arasindaki dikey araligi olc; mesafe 95.0-110.0 mm araliginda olmali.', 'Mekanik / Ergonomi', PRI.MED, DAL.D, STATUS.PASS],
  ['SY10', 'ST-10 Akis hizi limitleri', 'Sivi transfer hatti uzerinden saniyede gecen sivi miktarini kalibre sistemle olc; hat asgari 15 ml/sn korumali.', 'Hidrolik / Akiskan', PRI.MED, DAL.C, STATUS.PASS],
  ['SY11', 'ST-11 Bardak tasma guvenligi', 'Butun icecek profilleri icin alinabilecek en yuksek hacmi zorla; hicbir formul 230 ml sinirini asmamali.', 'Guvenlik / Emniyet', PRI.MED, DAL.C, STATUS.REVIEW],
  ['SY12', 'ST-12 Damlama siniri (post-pour)', 'Dokum bittikten sonra 5 sn periyotta nozul altina petri kabi koy, damlayi olc; dusen sivi maks 2.0 ml olmali.', 'Hidrolik / Akiskan', PRI.LOW, DAL.D, STATUS.PASS],
]

const SUB_TESTS = [
  ['B1', 'AST-01 Yazilim timeout ve debounce mantigi', 'Arayuze <50 ms art arda sinyaller gonder; seker seciminde 15000 ms eylemsiz bekle; promptun 500 ms icinde geldigini lojik analizorle olc.', 'Yazilim / Kontrol', PRI.HIGH, DAL.C, STATUS.PASS],
  ['B2', 'AST-02 PWM sut valfi surusu ve recete gecikmeleri', 'MCU PWM cikislarini osiloskopla izle (Kopuk>200, Sut<100); Venturi valfin 5 ml/sn emisini ve Macchiato 2000 ms delayini onayla.', 'Sut Sistemi', PRI.MED, DAL.C, STATUS.PASS],
  ['B3', 'AST-03 Akis olcumu, titresimli pompa ve ERR-01', 'Hall-Effect debimetre cikisini (450 pulse/L) onayla; sensoru 150 ml altina dusur, ERR-01 kilidini izle; pompanin 3.0 Bar urettigini manometreyle olc.', 'Hidrolik / Akiskan', PRI.HIGH, DAL.B, STATUS.PASS],
  ['B4', 'AST-04 Seker adim motoru kontrolu ve tork', 'Step motor saftinda torkmetreyi (min 2.0 kg-cm) test et; yazilimin her 4 g dozaj icin tam 200 step gonderdigini port uzerinden takip et.', 'Donanim', PRI.MED, DAL.C, STATUS.PASS],
  ['B5', 'AST-05 Toz motoru suresi ve mikser hizi', 'Mikser devrini temassiz takometreyle (12.000 RPM) olc; DC motor pininin porsiyonlama icin tam 2500 ms HIGH cekildigini lojik okuyucuyla test et.', 'Donanim', PRI.MED, DAL.C, STATUS.REVIEW],
  ['B6', 'AST-06 Sut debimetre kontrolu ve ERR-02', 'Sut hattini manuel kes; debimetrenin <10 ml/sn okumasini 3000 ms surdur; yazilim derhal "ERR-02 Sut Bitti" firlatmali.', 'Yazilim / Kontrol', PRI.MED, DAL.C, STATUS.PASS],
  ['B7', 'AST-07 PID kontrol dongusu ve thermoblock', '1200 W (+/-50) thermoblock ic rezistansini multimetreyle dogrula; PID isitma thread inin her 100 ms yineledigini debug portundan izle.', 'Isil Sistem', PRI.HIGH, DAL.B, STATUS.PASS],
  ['B8', 'AST-08 EEPROM bellek yonetimi', 'Yazilima 55 adet ERR kodu urettir, MCU yi yeniden baslat ve I2C uzerinden EEPROM oku; sadece son 50 hata tarih/saat pulu ile saklanmali (FIFO).', 'Yazilim / Kontrol', PRI.LOW, DAL.D, STATUS.PASS],
  ['B9', 'AST-09 Pre-infusion sirasi', 'Kahve tozunu demlemeden once pompa rolesinin surme zamanlarini osiloskopta izle (1500 ms on, 2000 ms off), ardindan surekli basinca gecmeli.', 'Yazilim / Kontrol', PRI.MED, DAL.C, STATUS.PASS],
  ['B10', 'AST-10 Ekran donanimi ve dimming sinyali', 'TFT LCD cozunurlugunun 800x480 ve boyutunun 5.0 inc oldugunu teyit et; 120 sn hareketsizlikte arka isik PWM sinyalinin %20 ye dustugunu olc.', 'Arayuz / HMI', PRI.MED, DAL.C, STATUS.PASS],
  ['B11', 'AST-11 Boot sekansi ve PCB guc tasima', 'PCB deki 10 rolenin (250V/10A) speklerini dogrula; guc verildiginde yazilimin 3000 ms logo gosterirken self-diagnostik registerlarini taradigini JTAG ile izle.', 'Donanim', PRI.HIGH, DAL.B, STATUS.REVIEW],
  ['B12', 'AST-12 Temizlik cevrimi mekanigi ve agirlik sensoru', 'Temizlik komutunu gonder; sicak su valfinin 5000 ms ac-kapa ve pompanin %50 PWM surusunu, Load Cell in (0-500 g, +/-1 g) ve 60 mm kilavuzun dogrulugunu test et.', 'Yazilim / Kontrol', PRI.MED, DAL.C, STATUS.PASS],
]

// ============================================================================
//  VERI: Sozluk  — [localKey, term, definition]
// ============================================================================
const GLOSSARY = [
  ['Espresso', 'Espresso', 'Yuksek basincli sicak suyun ince ogutulmus kahveden gecirilmesiyle elde edilen 30 ml yogun kahve.'],
  ['Doppio', 'Doppio', 'Cift shot espresso; toplam 60 ml yogun kahve.'],
  ['Cappuccino', 'Cappuccino', '30 ml espresso, 60 ml sicak sut ve 60 ml sut kopugunden olusan 150 ml icecek.'],
  ['Latte', 'Latte', '30 ml espresso, 150 ml sicak sut ve 20 ml kopukten olusan 200 ml sutlu icecek.'],
  ['PID', 'PID', 'Oransal-Integral-Turevsel kontrol; sicaklik/basinc regulasyonu icin geri beslemeli algoritma.'],
  ['PWM', 'PWM', 'Darbe Genislik Modulasyonu; valf/motor gucunu sinyal doluluk oraniyla ayarlama teknigi.'],
  ['Thermoblock', 'Thermoblock', 'Suyu aninda isitan kompakt rezistansli isitma blogu.'],
  ['Debimetre', 'Debimetre (Flowmeter)', 'Borudan gecen sivi debisini pulse ureterek olcen sensor.'],
  ['Venturi Valf', 'Venturi Valf', 'Hava emisiyle sutu kopuk formuna donusturen aerodinamik valf.'],
  ['Load Cell', 'Load Cell', 'Agirlik/kuvveti elektrik sinyaline ceviren yuk hucresi sensoru.'],
  ['EEPROM', 'EEPROM', 'Elektrikle silinip yazilabilen, guc kesildiginde veriyi koruyan kalici bellek.'],
  ['Pre-infusion', 'Pre-infusion', 'On demleme; ana basinctan once kahve tozunun az suyla islatilmasi.'],
  ['Premix', 'Premix', '1 shot icin porsiyonlanan hazir kahve tozu karisimi (6 g).'],
  ['TFT LCD', 'TFT LCD', 'Ince film transistorlu renkli dokunmatik gosterge paneli (5 inc, 800x480).'],
]

// ============================================================================
//  VERI: Roller  — [name, permsSpec]
// ============================================================================
const ROLES = [
  ['Sistem Muhendisi', perms({
    read: C_ALL, write: ['req-user', 'req-system'], add_requirement: ['req-user', 'req-system'],
    delete: ['req-user', 'req-system'], link_satisfies: C_SAT, link_assigned: C_REQ,
    approve: ['req-user', 'req-system'], manage_fields: true,
  })],
  ['Yazilim Tasarimcisi', perms({
    read: C_ALL, write: ['req-subsystem'], add_requirement: ['req-subsystem'],
    delete: ['req-subsystem'], link_satisfies: ['req-subsystem'], approve: ['req-subsystem'],
  })],
  ['Donanim Tasarimcisi', perms({
    read: C_ALL, write: ['req-subsystem'], add_requirement: ['req-subsystem'],
    delete: ['req-subsystem'], link_satisfies: ['req-subsystem'], approve: ['req-subsystem'],
  })],
  ['Test Muhendisi', perms({
    read: C_ALL, write: C_TEST, add_test: C_TEST, delete: C_TEST, link_verifies: C_TEST,
  })],
  ['Dogrulama Sorumlusu', perms({
    read: C_ALL, link_verifies: C_TEST, approve: [...C_TEST, 'req-user'],
  })],
  ['Gozlemci', perms({ read: C_ALL })],
]

// ============================================================================
//  VERI: Personel  — [firstName, lastName, roleName]
// ============================================================================
const PERSONNEL = [
  ['Ahmet', 'Yilmaz', 'Sistem Muhendisi'],
  ['Elif', 'Demir', 'Yazilim Tasarimcisi'],
  ['Mert', 'Kaya', 'Donanim Tasarimcisi'],
  ['Zeynep', 'Sahin', 'Test Muhendisi'],
  ['Can', 'Aydin', 'Dogrulama Sorumlusu'],
]

// ============================================================================
//  BAGLAR
// ============================================================================
// Satisfies: [parentKey, childKey]  (from=parent/ust, to=child/alt)
//  Kullanici <- Sistem  (her Sistem gereksiniminin bir Kullanici ust'u vardir)
const SAT_USER_SYSTEM = [
  ['U1', 'S1'], ['U1', 'S2'], ['U2', 'S3'], ['U1', 'S4'], ['U1', 'S5'], ['U1', 'S6'],
  ['U1', 'S7'], ['U1', 'S8'], ['U5', 'S8'], ['U1', 'S9'], ['U1', 'S10'], ['U1', 'S11'],
  ['U1', 'S12'], ['U11', 'S13'], ['U11', 'S14'], ['U10', 'S15'], ['U5', 'S16'], ['U1', 'S17'],
  ['U5', 'S18'], ['U10', 'S19'], ['U7', 'S20'],
]
//  Sistem <- Yazilim/Donanim
const SAT_SYSTEM_SUB = [
  ['S3', 'W1'], ['S3', 'W2'], ['S2', 'W3'], ['S7', 'W4'], ['S16', 'W5'], ['S3', 'W6'],
  ['S17', 'W7'], ['S2', 'W8'], ['S1', 'W9'], ['S3', 'W10'], ['S14', 'W11'], ['S4', 'W12'],
  ['S14', 'W13'], ['S16', 'W14'], ['S13', 'W15'], ['S15', 'W16'],
  ['S16', 'H1'], ['S2', 'H2'], ['S3', 'H3'], ['S13', 'H4'], ['S17', 'H5'], ['S15', 'H6'],
  ['S3', 'H7'], ['S1', 'H8'], ['S15', 'H9'], ['S16', 'H10'],
]

// Verifies: [testKey, [reqKey, ...]]  (from=req, to=test; COKLU dahil)
//  "Kapsanan" alanlarindan birebir turetildi.
const VERIFIES = [
  ['A1', ['U1', 'U2']], ['A2', ['U3', 'U4']], ['A3', ['U5', 'U10']], ['A4', ['U6']],
  ['A5', ['U7']], ['A6', ['U8']], ['A7', ['U9']], ['A8', ['U11', 'U12']],
  ['SY1', ['S1', 'S2', 'S18']], ['SY2', ['S3', 'S17']], ['SY3', ['S4', 'S5']], ['SY4', ['S6', 'S7']],
  ['SY5', ['S8', 'S9']], ['SY6', ['S10', 'S11', 'S12']], ['SY7', ['S13']], ['SY8', ['S14']],
  ['SY9', ['S15']], ['SY10', ['S16']], ['SY11', ['S19']], ['SY12', ['S20']],
  ['B1', ['W1', 'W2', 'W10']], ['B2', ['W3', 'W4', 'H2']], ['B3', ['W5', 'W14', 'H1', 'H10']],
  ['B4', ['W6', 'H3']], ['B5', ['W7', 'H5']], ['B6', ['W8']], ['B7', ['W9', 'H8']], ['B8', ['W11']],
  ['B9', ['W12']], ['B10', ['W13', 'H7']], ['B11', ['W15', 'H4']], ['B12', ['W16', 'H6', 'H9']],
]

// Assigned To: [reqKey, glossaryKey]  (from=req, to=glossary)
const ASSIGNED = [
  ['S4', 'Espresso'], ['S5', 'Doppio'], ['S7', 'Cappuccino'], ['S8', 'Latte'],
  ['W9', 'PID'], ['W3', 'PWM'], ['H8', 'Thermoblock'], ['H10', 'Debimetre'],
  ['H2', 'Venturi Valf'], ['H9', 'Load Cell'], ['W11', 'EEPROM'], ['W12', 'Pre-infusion'],
  ['S17', 'Premix'], ['H7', 'TFT LCD'],
]

// ============================================================================
//  BAG KURMA — tek yerde. Hem yeni seed hem ONARIM (repair) bunu kullanir.
//  POST /links backend'te idempotenttir (ayni from/to/type varsa tekrar yaratmaz),
//  bu yuzden var olan projede tekrar calistirmak guvenli: eksik baglar tamamlanir,
//  senin elle ekledigin baglar/duzenlemeler korunur.
// ============================================================================
async function buildLinks(P, reqId, testId, gloId) {
  let created = 0
  let skipped = 0
  const link = async (fromId, toId, type, label) => {
    if (!fromId || !toId) {
      skipped++
      console.warn(`    [!] atlanan bag (id bulunamadi): ${type} ${label || ''}`)
      return
    }
    await post(P('/links'), { fromId, toId, type })
    created++
  }
  // Satisfies (from=parent, to=child)
  for (const [parent, child] of SAT_USER_SYSTEM)
    await link(reqId[parent], reqId[child], LINK.SATISFIES, `${parent}->${child}`)
  for (const [parent, child] of SAT_SYSTEM_SUB)
    await link(reqId[parent], reqId[child], LINK.SATISFIES, `${parent}->${child}`)
  // Verifies (from=req, to=test) — coklu dahil
  for (const [testKey, reqKeys] of VERIFIES)
    for (const rk of reqKeys)
      await link(reqId[rk], testId[testKey], LINK.VERIFIES, `${rk}->${testKey}`)
  // Assigned To (from=req, to=glossary)
  for (const [rk, gk] of ASSIGNED)
    await link(reqId[rk], gloId[gk], LINK.ASSIGNED, `${rk}->${gk}`)
  return { created, skipped }
}

// Baslik/terim -> server id haritasi kur (birebir eslesme, bosluk normalize).
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
function mapByField(dataList, serverRows, field) {
  const byNorm = new Map(serverRows.map((r) => [norm(r[field]), r.id]))
  const map = {}
  const misses = []
  for (const row of dataList) {
    const localKey = row[0]
    const value = field === 'term' ? row[1] : row[1] // her iki listede de [key, baslik/terim, ...]
    const id = byNorm.get(norm(value))
    if (id) map[localKey] = id
    else misses.push(`${localKey} ("${value}")`)
  }
  return { map, misses }
}

// ============================================================================
//  ONARIM (REPAIR) — proje zaten varsa: mevcut nesneleri cek, localKey->id
//  haritasi kur, eksik baglari (ozellikle Verifies) tamamla.
// ============================================================================
async function repair(pid) {
  const P = (p) => `/projects/${pid}${p}`
  console.log(`\n[~] "${PROJECT_NAME}" projesi zaten mevcut (id: ${pid}).`)
  console.log('    ONARIM modu: eksik baglar (Satisfies/Verifies/Assigned) tamamlanacak.')
  console.log('    Mevcut nesnelerin ve elle ekledigin baglarin hicbiri silinmez.\n')

  const [reqs, tests, glossary, linksBefore] = await Promise.all([
    api('GET', P('/requirements')),
    api('GET', P('/testcases')),
    api('GET', P('/glossary')),
    api('GET', P('/links')),
  ])

  // Gereksinim + Test -> baslik ile; Sozluk -> terim ile esle.
  const reqData = [...USER, ...SYSTEM, ...SW, ...HW]
  const testData = [...ACC_TESTS, ...SYS_TESTS, ...SUB_TESTS]
  const rMap = mapByField(reqData, reqs, 'title')
  const tMap = mapByField(testData, tests, 'title')
  const gMap = mapByField(GLOSSARY, glossary, 'term')

  const allMisses = [...rMap.misses, ...tMap.misses, ...gMap.misses]
  if (allMisses.length) {
    console.warn(`    [!] ${allMisses.length} nesne baslik ile eslesmedi (elle degistirilmis olabilir):`)
    console.warn('        ' + allMisses.join(', '))
    console.warn('        Bu nesnelere ait baglar atlanacak.\n')
  }

  console.log(`    Mevcut durum: ${reqs.length} gereksinim · ${tests.length} test · ${glossary.length} sozluk · ${linksBefore.length} bag`)
  const { created, skipped } = await buildLinks(P, rMap.map, tMap.map, gMap.map)
  const linksAfter = await api('GET', P('/links'))
  console.log(`\n[+] Onarim tamam. Bag kurma denemesi: ${created} · atlanan: ${skipped}`)
  console.log(`    Bag sayisi: ${linksBefore.length} -> ${linksAfter.length} (idempotent: var olanlar tekrar yaratilmadi).`)
  console.log('\n===============================================================')
  console.log('  ONARIM TAMAMLANDI. Kapsam skoru artik %100 olmali.')
  console.log('  Uygulamada projeyi acip Kapsam Raporu / Dashboard\'i yenile.')
  console.log('===============================================================\n')
}

// ============================================================================
//  YURUTME
// ============================================================================
async function main() {
  // Baglanti kontrolu
  try {
    await api('GET', '/health')
  } catch (e) {
    console.error('\n[HATA] Backend\'e ulasilamadi (' + BASE + ').')
    console.error('       Once "docker compose up" ile backend\'i baslatin, sonra tekrar deneyin.\n')
    throw e
  }

  // 1) Proje — ayni isimli proje varsa ONAR (eksik baglari tamamla), yoksa YARAT.
  const existing = await api('GET', '/projects')
  const already = Array.isArray(existing) && existing.find((p) => p.name === PROJECT_NAME)
  if (already) {
    await repair(already.id)
    return
  }
  const project = await post('/projects', {
    name: PROJECT_NAME,
    description: 'Nicel metrikli espresso otomati TID belgesinden turetilmis V-Model referans projesi (DO-178C).',
  })
  const pid = project.id
  const P = (p) => `/projects/${pid}${p}`
  console.log(`\n[+] Proje olusturuldu: "${project.name}"  (id: ${pid})`)

  // 2) Alanlar (fields)
  const FIELDS = ['Arayuz / HMI', 'Yazilim / Kontrol', 'Donanim', 'Isil Sistem',
    'Hidrolik / Akiskan', 'Dozajlama', 'Sut Sistemi', 'Guvenlik / Emniyet',
    'Enerji Yonetimi', 'Mekanik / Ergonomi', 'Genel']
  for (const name of FIELDS) await post(P('/fields'), { name })
  console.log(`[+] ${FIELDS.length} alan (field) eklendi.`)

  // 3) Roller
  const roleIdByName = {}
  for (const [name, permissions] of ROLES) {
    const r = await post(P('/roles'), { name, permissions })
    roleIdByName[name] = r.id
  }
  console.log(`[+] ${ROLES.length} rol olusturuldu.`)

  // 4) Personel (passcode'lar konsola yazilir)
  const passcodes = []
  for (const [firstName, lastName, roleName] of PERSONNEL) {
    const p = await post(P('/personnel'), { firstName, lastName, roleId: roleIdByName[roleName] })
    passcodes.push(`    ${firstName} ${lastName}  (${roleName})  ->  passcode: ${p.passcode}`)
  }
  console.log(`[+] ${PERSONNEL.length} personel eklendi:`)
  console.log(passcodes.join('\n'))

  // 5) Gereksinimler
  const reqId = {} // localKey -> server id
  const addReqs = async (list, type) => {
    for (const [key, title, description, field, priority, dal_level] of list) {
      const row = await post(P('/requirements'), { type, title, description, field, priority, dal_level })
      reqId[key] = row.id
    }
  }
  await addReqs(USER, REQ.USER)
  await addReqs(SYSTEM, REQ.SYSTEM)
  await addReqs(SW, REQ.SOFTWARE)
  await addReqs(HW, REQ.HARDWARE)
  console.log(`[+] Gereksinimler: ${USER.length} Kullanici + ${SYSTEM.length} Sistem + ${SW.length} Yazilim + ${HW.length} Donanim = ${USER.length + SYSTEM.length + SW.length + HW.length}`)

  // 6) Testler
  const testId = {} // localKey -> server id
  const addTests = async (list, type) => {
    for (const [key, title, description, field, priority, dal_level, status] of list) {
      const row = await post(P('/testcases'), { type, title, description, field, priority, dal_level, status })
      testId[key] = row.id
    }
  }
  await addTests(ACC_TESTS, TEST.ACC)
  await addTests(SYS_TESTS, TEST.SYS)
  await addTests(SUB_TESTS, TEST.SUB)
  console.log(`[+] Testler: ${ACC_TESTS.length} Kabul + ${SYS_TESTS.length} Sistem + ${SUB_TESTS.length} Alt-sistem = ${ACC_TESTS.length + SYS_TESTS.length + SUB_TESTS.length}`)

  // 7) Sozluk
  const gloId = {} // localKey -> server id
  for (const [key, term, definition] of GLOSSARY) {
    const row = await post(P('/glossary'), { term, definition })
    gloId[key] = row.id
  }
  console.log(`[+] Sozluk: ${GLOSSARY.length} terim.`)

  // 8) Baglar (buildLinks: Satisfies + Verifies[coklu] + Assigned To)
  const { created: linkCount, skipped } = await buildLinks(P, reqId, testId, gloId)
  console.log(`[+] Baglar: ${linkCount} adet kuruldu${skipped ? ` (${skipped} atlandi)` : ''}.`)

  console.log('\n===============================================================')
  console.log('  TAMAMLANDI. Uygulamayi acip yeni projeyi secebilirsin.')
  console.log('  Proje adi: ' + project.name)
  console.log('===============================================================\n')
}

main().catch((e) => {
  console.error('\n[SEED HATASI]', e.message)
  process.exitCode = 1
})
