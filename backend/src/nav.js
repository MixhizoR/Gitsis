// ============================================================================
//  nav.js — Sol menu duzeni (proje bazli gruplar + sayfa yerlesimi).
//  Issue #9 / Adim 6.
//
//  Davranis:
//   - Projede hic NavGroup yoksa YERLESIK varsayilan duzen dondurulur
//     (DB'ye yazilmadan). Boylece mevcut projeler icin migration/seed gerekmez.
//   - Ilk ozellestirmede (grup ekleme / oge tasima) varsayilan duzen DB'ye
//     MATERIALIZE edilir, sonra degisiklik uygulanir.
//   - Grup silinince item'lari grupsuz seviyeye duser (schema'da SetNull);
//     hicbir sayfa kaybolmaz, navigasyon her zaman calisir kalir.
// ============================================================================
import { DEFAULT_GROUPS, DEFAULT_UNGROUPED, builtInLayout, isValidPageKey } from './navDefaults.js';

function bad(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

const toItem = (i) => ({
  id: i.id,
  pageKey: i.pageKey,
  label: i.label ?? null,
  fieldFilter: i.fieldFilter ?? null,
  order: i.order,
});

/** Projenin menu duzenini dondurur; ozellestirme yoksa yerlesik varsayilan. */
export async function getNavLayout(prisma, projectId) {
  const groups = await prisma.navGroup.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (groups.length === 0) {
    const items = await prisma.navItem.findMany({ where: { projectId } });
    // Hic grup ve hic item yoksa: heniz ozellestirilmemis.
    if (items.length === 0) return builtInLayout();
  }
  const ungrouped = await prisma.navItem.findMany({
    where: { projectId, groupId: null },
    orderBy: { order: 'asc' },
  });
  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      nameKey: null, // materialize edilmis: etiket kullanicinin verdigi isim
      order: g.order,
      items: g.items.map(toItem),
    })),
    ungrouped: ungrouped.map(toItem),
    materialized: true,
  };
}

/**
 * Yerlesik varsayilani DB'ye yazar (yalnizca hic kayit yoksa). Ilk
 * ozellestirmeden ONCE cagrilir; idempotent.
 */
export async function materializeDefaults(tx, projectId) {
  const existing = await tx.navGroup.count({ where: { projectId } });
  const existingItems = await tx.navItem.count({ where: { projectId } });
  if (existing > 0 || existingItems > 0) return;

  for (const g of DEFAULT_GROUPS) {
    const group = await tx.navGroup.create({
      data: { projectId, name: g.name, order: g.order },
    });
    await tx.navItem.createMany({
      data: g.pageKeys.map((pageKey, i) => ({ projectId, groupId: group.id, pageKey, order: i })),
    });
  }
  await tx.navItem.createMany({
    data: DEFAULT_UNGROUPED.map((pageKey, i) => ({ projectId, groupId: null, pageKey, order: i })),
  });
}

/**
 * Yerlesik varsayilani DB'ye yazip guncel duzeni dondurur. PM "Menuyu duzenle"
 * ekranini actiginda cagrilir: varsayilan gruplarin id'si olmadan select ile
 * hedef gosterilemez, bu yuzden duzenlemeden ONCE materialize edilir.
 * Idempotent — zaten materialize edilmisse hicbir sey yazmaz.
 */
export async function ensureMaterialized(prisma, projectId) {
  await prisma.$transaction(async (tx) => materializeDefaults(tx, projectId));
  return getNavLayout(prisma, projectId);
}

export async function createGroup(prisma, projectId, name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw bad('Grup adi zorunlu.');
  return prisma.$transaction(async (tx) => {
    await materializeDefaults(tx, projectId);
    const dup = await tx.navGroup.findFirst({ where: { projectId, name: clean } });
    if (dup) throw bad('Bu adda bir grup zaten var.', 409);
    const maxOrder = await tx.navGroup.aggregate({ where: { projectId }, _max: { order: true } });
    return tx.navGroup.create({
      data: { projectId, name: clean, order: (maxOrder._max.order ?? -1) + 1 },
    });
  });
}

export async function updateGroup(prisma, projectId, groupId, data) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.navGroup.findUnique({ where: { id: groupId } });
    if (!group || group.projectId !== projectId) throw bad('Grup bulunamadi.', 404);
    const patch = {};
    if (data.name != null) {
      const clean = String(data.name).trim();
      if (!clean) throw bad('Grup adi bos olamaz.');
      const dup = await tx.navGroup.findFirst({
        where: { projectId, name: clean, id: { not: groupId } },
      });
      if (dup) throw bad('Bu adda bir grup zaten var.', 409);
      patch.name = clean;
    }
    if (data.order != null) patch.order = Number(data.order) || 0;
    return tx.navGroup.update({ where: { id: groupId }, data: patch });
  });
}

/** Grubu siler; item'lari grupsuz seviyeye duser (SetNull). */
export async function deleteGroup(prisma, projectId, groupId) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.navGroup.findUnique({ where: { id: groupId } });
    if (!group || group.projectId !== projectId) throw bad('Grup bulunamadi.', 404);
    const moved = await tx.navItem.count({ where: { projectId, groupId } });
    await tx.navGroup.delete({ where: { id: groupId } });
    return { ok: true, movedToUngrouped: moved };
  });
}

/**
 * Bir gruba YENI sayfa ekler. Sayfa = sabit bir temel tip (pageKey) +
 * istege bagli ozel ad ve Alan filtresi. Ayni tipten birden fazla sayfa
 * eklenebilir; boylece kullanici gruba istedigi kadar sayfa koyabilir.
 */
export async function createItem(prisma, projectId, { groupId, pageKey, label, fieldFilter }) {
  if (!isValidPageKey(pageKey)) throw bad('Gecersiz sayfa tipi.');
  return prisma.$transaction(async (tx) => {
    await materializeDefaults(tx, projectId);
    if (groupId) {
      const group = await tx.navGroup.findUnique({ where: { id: groupId } });
      if (!group || group.projectId !== projectId) throw bad('Hedef grup bulunamadi.', 404);
    }
    const maxOrder = await tx.navItem.aggregate({
      where: { projectId, groupId: groupId || null },
      _max: { order: true },
    });
    return tx.navItem.create({
      data: {
        projectId,
        groupId: groupId || null,
        pageKey,
        label: label?.trim() || null,
        fieldFilter: fieldFilter?.trim() || null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  });
}

/** Bir menu ogesini gunceller: grup, sira, ozel ad, Alan filtresi. */
export async function updateItem(prisma, projectId, itemId, data) {
  return prisma.$transaction(async (tx) => {
    await materializeDefaults(tx, projectId);
    const item = await tx.navItem.findUnique({ where: { id: itemId } });
    if (!item || item.projectId !== projectId) throw bad('Menu ogesi bulunamadi.', 404);
    if (data.groupId) {
      const group = await tx.navGroup.findUnique({ where: { id: data.groupId } });
      if (!group || group.projectId !== projectId) throw bad('Hedef grup bulunamadi.', 404);
    }
    const patch = {};
    if (data.groupId !== undefined) patch.groupId = data.groupId || null;
    if (data.order !== undefined) patch.order = Number(data.order) || 0;
    if (data.label !== undefined) patch.label = String(data.label ?? '').trim() || null;
    if (data.fieldFilter !== undefined) {
      patch.fieldFilter = String(data.fieldFilter ?? '').trim() || null;
    }
    return tx.navItem.update({ where: { id: itemId }, data: patch });
  });
}

/**
 * Bir menu ogesini menuden kaldirir. Yalnizca MENU kaydi silinir —
 * gereksinim/test verilerine DOKUNULMAZ.
 */
export async function deleteItem(prisma, projectId, itemId) {
  const item = await prisma.navItem.findUnique({ where: { id: itemId } });
  if (!item || item.projectId !== projectId) throw bad('Menu ogesi bulunamadi.', 404);
  await prisma.navItem.delete({ where: { id: itemId } });
  return { ok: true, pageKey: item.pageKey };
}
