// ============================================================================
//  documentService.test.js — splitSegments regresyon testleri.
//  Metnin segmentlere bolunmesi: madde isareti temizligi, cumle ayirma ve
//  kisa parcaların elenmesi.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { splitSegments } from '../documentService.js'

describe('splitSegments', () => {
  it('bos/olmayan metin icin bos dizi dondurur', () => {
    expect(splitSegments('')).toEqual([])
    expect(splitSegments(null)).toEqual([])
    expect(splitSegments('   \n  \r\n ')).toEqual([])
  })

  it('madde isaretlerini (- * • 1. a) temizler', () => {
    const text = [
      '- Makine acilis ekranini gostermelidir',
      '* Seker secimi yapilmadan ogutme baslamamalidir',
      '• Dokunmatik ekran tepki suresi 500 ms olmalidir',
      '1) Cihaz kapagi acikken calisma engellenmelidir',
      'a) Hata durumunda kullanici uyarmalidir',
    ].join('\n')

    expect(splitSegments(text)).toEqual([
      'Makine acilis ekranini gostermelidir',
      'Seker secimi yapilmadan ogutme baslamamalidir',
      'Dokunmatik ekran tepki suresi 500 ms olmalidir',
      'Cihaz kapagi acikken calisma engellenmelidir',
      'Hata durumunda kullanici uyarmalidir',
    ])
  })

  it('uzun satirlari cumle sinirlarindan ayirir', () => {
    const text =
      'Makine dokuz adet kahve secenegi sunmalidir. Ekran, girilen siparisi bes saniye icinde onaylamalidir.'
    expect(splitSegments(text)).toHaveLength(2)
  })

  it('8 karakterden kisa parcalari eler', () => {
    expect(splitSegments('Merhaba')).toEqual([]) // 7 karakter
    expect(splitSegments('Kisa satir')).toEqual(['Kisa satir']) // 10 karakter
  })

  it('satir sonlarindaki bosluklari ve CR karakterlerini yok sayar', () => {
    const text = 'Sistem log kaydi tutmalidir.\r\n\n  Sifreler hashlenerek saklanmalidir.  '
    expect(splitSegments(text)).toEqual([
      'Sistem log kaydi tutmalidir.',
      'Sifreler hashlenerek saklanmalidir.',
    ])
  })
})
