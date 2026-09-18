// ============================================================================
//  views.js  —  Kayitli Gorunumler (Saved Views).
//
//  Bir liste sayfasinin (navKey) o anki FILTRE + SUTUN + SATIR duzenini
//  isimlendirip kalici saklar. Frontend'deki sessionStorage tabanli gecici
//  filtre durumunun (useEntityFilters) aksine bu kayit KULLANICI bazlidir ve
//  oturum kapaninca kaybolmaz — kullanici ayni gorunumu her girisinde ayni
//  sekilde bulur.
//
//  Gorunum uc parcadan olusur:
//    filters   : { q, type, field, status, assignee, attrs } — useEntityFilters semasi
//    columns   : SIRALI [{ key, visible }] — hangi sutun gorunur ve hangi sirada
//    rowLayout : { pageSize, sortBy, sortDir } — satir duzeni
//
//  Sutun anahtarlari BURADA bir kara/beyaz listeye baglanmaz: sutun kumesi
//  projeye gore degisir (modular oznitelikler -> 'attr:<key>'), yeni bir
//  oznitelik eklendiginde backend'i degistirmek gerekmemelidir. Yalnizca
//  bicim (string + uzunluk + adet) dogrulanir. Siralama olcutu ise
//  sunucu tarafinda anlamli olacak sekilde sinirlanir (SORT_KEYS + attr:*).
//
//  PAYLASIM (ileriye donuk): scope='project' olan gorunumlerin userId'si
//  NULL'dur ve projedeki HERKES tarafindan gorulur. Su an yalnizca PM
//  olusturabilir/duzenleyebilir; ileride daha ince paylasim kurallari
//  (rol bazli, kisi bazli) bu alan uzerinden eklenebilir.
// ============================================================================

export const VIEW_SCOPES = ['user', 'project'];

// Siralama olcutleri: ana tablo kolonlari + modular oznitelikler ('attr:<key>').
export const SORT_KEYS = ['text_id', 'title', 'type', 'field', 'status', 'createdAt', 'updatedAt'];

// Sayfa boyutu secenekleri. 0 => "tumu" (sayfalama kapali).
export const PAGE_SIZES = [10, 25, 50, 100, 200, 0];

export const DEFAULT_ROW_LAYOUT = { pageSize: 25, sortBy: 'text_id', sortDir: 'asc' };

export const EMPTY_FILTERS = { q: '', type: '', field: '', status: '', assignee: '', attrs: {} };

const MAX_COLUMNS = 60;
const MAX_KEY_LEN = 80;
const MAX_NAME_LEN = 80;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const str = (v, max = 200) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

/** Istemciden gelen filtre nesnesini useEntityFilters semasina indirger. */
export function normalizeFilters(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const attrs = {};
  if (f.attrs && typeof f.attrs === 'object' && !Array.isArray(f.attrs)) {
    for (const [k, v] of Object.entries(f.attrs)) {
      const key = str(k, MAX_KEY_LEN);
      if (!key) continue;
      if (v === null || v === undefined || v === '') continue;
      attrs[key] = typeof v === 'boolean' || typeof v === 'number' ? v : str(v, 500);
    }
  }
  return {
    q: str(f.q, 500),
    type: str(f.type, 120),
    field: str(f.field, 120),
    status: str(f.status, 120),
    assignee: str(f.assignee, 120),
    attrs,
  };
}

/**
 * Sutun duzeni: SIRALI liste. Sira bilgisi ayri bir alanda degil, listedeki
 * sirada tasinir — tek dogruluk kaynagi. Ayni anahtar iki kez gelirse ilki
 * kazanir (istemci hatasi sessizce duzeltilir, gorunum bozulmaz).
 */
export function normalizeColumns(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const key = typeof c === 'string' ? str(c, MAX_KEY_LEN) : str(c?.key, MAX_KEY_LEN);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: typeof c === 'string' ? true : c?.visible !== false });
    if (out.length >= MAX_COLUMNS) break;
  }
  return out;
}

/** Satir duzeni: sayfa boyutu + siralama olcutu/yonu. */
export function normalizeRowLayout(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const size = Number(r.pageSize);
  const sortBy = str(r.sortBy, MAX_KEY_LEN);
  const sortByOk = SORT_KEYS.includes(sortBy) || /^attr:[^\s]{1,60}$/.test(sortBy);
  return {
    pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_ROW_LAYOUT.pageSize,
    sortBy: sortByOk ? sortBy : DEFAULT_ROW_LAYOUT.sortBy,
    sortDir: r.sortDir === 'desc' ? 'desc' : 'asc',
  };
}

/** Olusturma/guncelleme govdesini dogrular ve saklanacak hale getirir. */
export function normalizeViewInput(body, { partial = false } = {}) {
  const b = body || {};
  const out = {};

  if (!partial || b.name !== undefined) {
    const name = str(b.name, MAX_NAME_LEN);
    if (!name) throw bad('Gorunum adi zorunlu.');
    out.name = name;
  }
  if (!partial || b.filters !== undefined) out.filters = normalizeFilters(b.filters);
  if (!partial || b.columns !== undefined) out.columns = normalizeColumns(b.columns);
  if (!partial || b.rowLayout !== undefined) out.rowLayout = normalizeRowLayout(b.rowLayout);
  if (b.scope !== undefined) {
    if (!VIEW_SCOPES.includes(b.scope)) throw bad('Gecersiz gorunum kapsami.');
    out.scope = b.scope;
  }
  return out;
}

/**
 * Bir kullanicinin bir projede GOREBILECEGI gorunumler: kendi kisisel
 * gorunumleri + proje geneli (paylasilan) gorunumler. navKey verilirse
 * yalnizca o sayfaninkiler doner.
 */
export async function listViews(prisma, projectId, userId, navKey) {
  const where = {
    projectId,
    OR: [{ userId }, { scope: 'project' }],
  };
  if (navKey) where.navKey = str(navKey, MAX_KEY_LEN);
  return prisma.savedView.findMany({
    where,
    orderBy: [{ navKey: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
  });
}

/** Ayni sahip + sayfa icinde ayni ada sahip ikinci bir gorunum olamaz. */
async function assertNameFree(prisma, { projectId, userId, navKey, name, scope, exceptId = null }) {
  const existing = await prisma.savedView.findFirst({
    where: {
      projectId,
      navKey,
      name,
      ...(scope === 'project' ? { scope: 'project' } : { userId }),
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw bad('Bu isimde bir gorunum zaten var.', 409);
}

export async function createView(prisma, { projectId, userId, isPM, navKey, body }) {
  const key = str(navKey || body?.navKey, MAX_KEY_LEN);
  if (!key) throw bad('navKey zorunlu.');
  const payload = normalizeViewInput(body);
  const scope = payload.scope || 'user';
  if (scope === 'project' && !isPM) throw bad('Proje geneli gorunum olusturma yetkiniz yok.', 403);
  await assertNameFree(prisma, { projectId, userId, navKey: key, name: payload.name, scope });

  const created = await prisma.savedView.create({
    data: {
      projectId,
      // Proje geneli gorunum kisiye ait degildir (userId NULL).
      userId: scope === 'project' ? null : userId,
      navKey: key,
      scope,
      name: payload.name,
      filters: payload.filters,
      columns: payload.columns,
      rowLayout: payload.rowLayout,
    },
  });
  // Ilk gorunum dogrudan varsayilan olsun — kullanici ayrica isaretlemek
  // zorunda kalmasin (sayfa acilisinda hemen ise yarar).
  if (body?.isDefault) return setDefaultView(prisma, { projectId, userId, isPM, id: created.id });
  return created;
}

/** Yazma yetkisi: kisisel gorunum yalnizca sahibinin, proje geneli PM'in. */
export async function loadWritable(prisma, { projectId, userId, isPM, id }) {
  const view = await prisma.savedView.findFirst({ where: { id, projectId } });
  if (!view) throw bad('Gorunum bulunamadi.', 404);
  if (view.scope === 'project') {
    if (!isPM) throw bad('Proje geneli gorunumu degistirme yetkiniz yok.', 403);
  } else if (view.userId !== userId) {
    throw bad('Bu gorunum size ait degil.', 403);
  }
  return view;
}

export async function updateView(prisma, { projectId, userId, isPM, id, body }) {
  const view = await loadWritable(prisma, { projectId, userId, isPM, id });
  const payload = normalizeViewInput(body, { partial: true });
  if (payload.scope && payload.scope !== view.scope) {
    // Kapsam degisimi paylasim semantigini degistirir; PM'e ozel.
    if (!isPM) throw bad('Gorunum kapsamini degistirme yetkiniz yok.', 403);
  }
  const scope = payload.scope || view.scope;
  if (payload.name) {
    await assertNameFree(prisma, {
      projectId,
      userId,
      navKey: view.navKey,
      name: payload.name,
      scope,
      exceptId: view.id,
    });
  }
  const data = { ...payload };
  if (payload.scope) data.userId = scope === 'project' ? null : userId;
  const updated = await prisma.savedView.update({ where: { id: view.id }, data });
  if (body?.isDefault === true) return setDefaultView(prisma, { projectId, userId, isPM, id: view.id });
  if (body?.isDefault === false && updated.isDefault)
    return prisma.savedView.update({ where: { id: view.id }, data: { isDefault: false } });
  return updated;
}

export async function deleteView(prisma, { projectId, userId, isPM, id }) {
  const view = await loadWritable(prisma, { projectId, userId, isPM, id });
  await prisma.savedView.delete({ where: { id: view.id } });
  return { ok: true, id: view.id };
}

/**
 * Varsayilan isaretleme: ayni (proje, sahip, navKey) ucgeninde EN FAZLA BIR
 * varsayilan olur — once digerleri temizlenir, sonra bu isaretlenir.
 * Kisisel ve proje geneli varsayilanlar AYRI kovalardir; sayfa acilisinda
 * kisisel varsayilan onceliklidir (frontend kurali).
 */
export async function setDefaultView(prisma, { projectId, userId, isPM, id }) {
  const view = await loadWritable(prisma, { projectId, userId, isPM, id });
  const bucket = view.scope === 'project' ? { scope: 'project' } : { userId: view.userId, scope: 'user' };
  await prisma.savedView.updateMany({
    where: { projectId, navKey: view.navKey, isDefault: true, ...bucket },
    data: { isDefault: false },
  });
  return prisma.savedView.update({ where: { id: view.id }, data: { isDefault: true } });
}
