// ============================================================================
//  idGen.js — text_id ureteci (server.js'ten cikarildi, Issue #9 / Adim 3).
//  OMUR BOYU BENZERSIZLIK (kara liste): bir text_id bir kez uretildiyse, ilgili
//  kayit SILINSE BILE numarasi asla yeniden kullanilmaz. Bunun icin sadece
//  CANLI kayitlara degil, AuditLog'daki tum textId izlerine de bakariz
//  (silme kayitlari audit'te kalir). Boylece "en yuksek numarali kaydi silip
//  ayni kodu tekrar uretme" acigi kapanir.
//  `prisma` parametre olarak alinir ki interaktif $transaction(tx => ...)
//  icinden de (split/merge, Adim 3) ayni garantiyle cagrilabilsin.
// ============================================================================
import { TYPE_PREFIX } from './constants.js';

export async function nextTextId(prisma, projectId, type, isTest) {
  const prefix = TYPE_PREFIX[type] || 'REQ-GEN';
  const [rows, auditRows] = await Promise.all([
    isTest
      ? prisma.testCase.findMany({ where: { projectId }, select: { text_id: true } })
      : prisma.requirement.findMany({ where: { projectId }, select: { text_id: true } }),
    // Audit'te textId "REQ-SYS-001 -> TC-SYS-002" gibi birlesik de olabildigi
    // icin bosluk/ok'a gore parcalayip her parcayi degerlendiririz.
    prisma.auditLog.findMany({
      where: { projectId, textId: { startsWith: prefix + '-' } },
      select: { textId: true },
    }),
  ]);
  let max = 0;
  const consider = (raw) => {
    if (!raw) return;
    for (const token of String(raw).split(/[\s>-]*->[\s>-]*|\s+/)) {
      if (token && token.startsWith(prefix + '-')) {
        const n = parseInt(token.split('-').pop(), 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
  };
  for (const { text_id } of rows) consider(text_id);
  for (const { textId } of auditRows) consider(textId);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}
