import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  CheckBox,
  Dialog,
  Input,
  Label,
  Option,
  Select,
  Tab,
  TabContainer,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  EmptyRow,
  PageHeader,
  Section,
  RATE_KIND_LABEL,
  formatDate,
  formatMoney,
  formatPct,
  num,
  TableSkeleton,
} from '../components/ui.js';
import type { LaborRate, Material, PricingPolicy, RateKind } from '../api/types.js';

export default function PricingPage() {
  return (
    <div className="mp-page">
      <PageHeader
        title="Fiyatlandırma"
        subtitle="Güncel hammadde fiyatları, işçilik/mühendislik ücretleri ve fiyat politikaları — dinamik maliyet hesabı bu verilerden beslenir"
      />

      <TabContainer contentBackgroundDesign="Transparent">
        <Tab text="Hammaddeler" selected>
          <MaterialsTab />
        </Tab>
        <Tab text="İşçilik ve Mühendislik">
          <RatesTab />
        </Tab>
        <Tab text="Fiyat Politikaları">
          <PoliciesTab />
        </Tab>
      </TabContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MaterialsTab() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Material | null | undefined>(undefined);
  const [history, setHistory] = useState<Material | null>(null);

  const list = useQuery({
    queryKey: ['materials', search],
    queryFn: () =>
      api.get<Material[]>(`/pricing/materials${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setEditing(null)}
        createLabel="Yeni Hammadde"
        canCreate={can('FIYATLANDIRMA', 'create')}
        count={list.data?.length}
      />

      <div className="mp-note">
        Buradaki güncel fiyat, teklif konfigüratöründe maliyet hesabına doğrudan girer. Fiyatı
        güncellediğinizde eski değer otomatik olarak fiyat geçmişine yazılır.
      </div>

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Malzeme</th>
                <th>Kategori</th>
                <th>Tedarikçi</th>
                <th className="mp-num">Güncel fiyat</th>
                <th>Birim</th>
                <th className="mp-num">Fire</th>
                <th>Son güncelleme</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((m) => (
                <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.5 }}>
                  <td>{m.code}</td>
                  <td>
                    <strong>{m.name}</strong>
                  </td>
                  <td>{m.category ?? '-'}</td>
                  <td>{m.supplier ?? '-'}</td>
                  <td className="mp-num">{formatMoney(m.currentPrice, m.currency)}</td>
                  <td>{m.unit}</td>
                  <td className="mp-num">{formatPct(m.scrapPct, 0)}</td>
                  <td>{formatDate(m.priceUpdatedAt)}</td>
                  <td>
                    <div className="mp-inline-actions">
                      <Button design="Transparent" icon="history" onClick={() => setHistory(m)} />
                      {can('FIYATLANDIRMA', 'edit') && (
                        <Button design="Transparent" icon="edit" onClick={() => setEditing(m)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <MaterialDialog
          material={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.refetch();
          }}
        />
      )}

      {history && <PriceHistoryDialog material={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function MaterialDialog({
  material,
  onClose,
  onSaved,
}: {
  material: Material | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    code: material?.code ?? '',
    name: material?.name ?? '',
    category: material?.category ?? '',
    unit: material?.unit ?? 'kg',
    currentPrice: material?.currentPrice ?? 0,
    scrapPct: material?.scrapPct ?? 0,
    supplier: material?.supplier ?? '',
    notes: material?.notes ?? '',
    isActive: material?.isActive ?? true,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        currentPrice: num(form.currentPrice),
        scrapPct: num(form.scrapPct),
      };
      return material
        ? api.put(`/pricing/materials/${material.id}`, payload)
        : api.post('/pricing/materials', payload);
    },
    onSuccess: () => {
      toast(material ? 'Hammadde güncellendi.' : 'Hammadde eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const priceChanged = material && Number(form.currentPrice) !== material.currentPrice;

  return (
    <Dialog
      open
      headerText={material ? 'Hammaddeyi Düzenle' : 'Yeni Hammadde'}
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!form.code || !form.name}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        {priceChanged && (
          <div className="mp-form__full mp-note mp-note--warning">
            Fiyat değişti. Kaydettiğinizde eski fiyat geçmişe yazılacak ve açık tekliflerde
            "Fiyatları güncelle" ile yeniden hesaplanabilecek.
          </div>
        )}
        <div>
          <Label required showColon>Kod</Label>
          <Input style={{ width: '100%' }} value={form.code} onInput={(e) => set('code', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Malzeme adı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label showColon>Kategori</Label>
          <Input style={{ width: '100%' }} value={form.category} onInput={(e) => set('category', e.target.value)} />
        </div>
        <div>
          <Label showColon>Tedarikçi</Label>
          <Input style={{ width: '100%' }} value={form.supplier} onInput={(e) => set('supplier', e.target.value)} />
        </div>
        <div>
          <Label showColon>Birim</Label>
          <Input style={{ width: '100%' }} value={form.unit} onInput={(e) => set('unit', e.target.value)} />
        </div>
        <div>
          <Label showColon>Güncel birim fiyat</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.currentPrice)}
            onInput={(e) => set('currentPrice', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Fire oranı (%)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.scrapPct)}
            onInput={(e) => set('scrapPct', e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <CheckBox text="Aktif" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
        </div>
      </div>
    </Dialog>
  );
}

function PriceHistoryDialog({ material, onClose }: { material: Material; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['material-history', material.id],
    queryFn: () =>
      api.get<{ id: string; price: number; currency: string; validFrom: string; source: string | null }[]>(
        `/pricing/materials/${material.id}/history`,
      ),
  });

  return (
    <Dialog
      open
      headerText={`Fiyat geçmişi - ${material.name}`}
      onClose={onClose}
      style={{ width: '520px', maxWidth: '95vw' }}
      footer={<Bar endContent={<Button design="Emphasized" onClick={onClose}>Kapat</Button>} />}
    >
      <div style={{ padding: '0.5rem 0' }}>
        {!history.data?.length ? (
          <EmptyRow text="Geçmiş kaydı yok." />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th className="mp-num">Fiyat</th>
                  <th>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.validFrom)}</td>
                    <td className="mp-num">{formatMoney(h.price, h.currency)}</td>
                    <td>{h.source ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function RatesTab() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<LaborRate | null | undefined>(undefined);

  const list = useQuery({
    queryKey: ['rates'],
    queryFn: () => api.get<LaborRate[]>('/pricing/rates'),
  });

  return (
    <div>
      <DataToolbar
        onRefresh={() => list.refetch()}
        onCreate={() => setEditing(null)}
        createLabel="Yeni Ücret"
        canCreate={can('FIYATLANDIRMA', 'create')}
        count={list.data?.length}
      />

      <div className="mp-note">
        İşçilik süreleri ve mühendislik eforu bu saatlik ücretlerle çarpılarak maliyete eklenir.
      </div>

      {list.isLoading ? (
        <TableSkeleton />
      ) : (
        (['ISCILIK', 'MUHENDISLIK', 'SAHA_SERVIS'] as RateKind[]).map((kind) => {
          const rows = (list.data ?? []).filter((r) => r.kind === kind);
          if (!rows.length) return null;
          return (
            <Section key={kind} title={RATE_KIND_LABEL[kind]}>
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kod</th>
                      <th>Tanım</th>
                      <th className="mp-num">Saatlik ücret</th>
                      <th>Durum</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.5 }}>
                        <td>{r.code}</td>
                        <td>
                          <strong>{r.name}</strong>
                        </td>
                        <td className="mp-num">{formatMoney(r.hourlyRate, r.currency)}</td>
                        <td>{r.isActive ? 'Aktif' : 'Pasif'}</td>
                        <td>
                          {can('FIYATLANDIRMA', 'edit') && (
                            <Button design="Transparent" icon="edit" onClick={() => setEditing(r)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          );
        })
      )}

      {editing !== undefined && (
        <RateDialog
          rate={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

function RateDialog({
  rate,
  onClose,
  onSaved,
}: {
  rate: LaborRate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    code: rate?.code ?? '',
    name: rate?.name ?? '',
    kind: (rate?.kind ?? 'ISCILIK') as RateKind,
    hourlyRate: rate?.hourlyRate ?? 0,
    isActive: rate?.isActive ?? true,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, hourlyRate: num(form.hourlyRate) };
      return rate ? api.put(`/pricing/rates/${rate.id}`, payload) : api.post('/pricing/rates', payload);
    },
    onSuccess: () => {
      toast(rate ? 'Ücret güncellendi.' : 'Ücret eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText={rate ? 'Ücreti Düzenle' : 'Yeni Ücret'}
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!form.code || !form.name}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '400px', padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Kod</Label>
          <Input style={{ width: '100%' }} value={form.code} onInput={(e) => set('code', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Tanım</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label showColon>Tür</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('kind', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(RATE_KIND_LABEL) as RateKind[]).map((k) => (
              <Option key={k} data-value={k} selected={form.kind === k}>
                {RATE_KIND_LABEL[k]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Saatlik ücret</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.hourlyRate)}
            onInput={(e) => set('hourlyRate', e.target.value)}
          />
        </div>
        <CheckBox text="Aktif" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function PoliciesTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PricingPolicy | null | undefined>(undefined);

  const list = useQuery({
    queryKey: ['policies'],
    queryFn: () => api.get<PricingPolicy[]>('/pricing/policies'),
  });

  return (
    <div>
      <DataToolbar
        onRefresh={() => list.refetch()}
        onCreate={() => setEditing(null)}
        createLabel="Yeni Politika"
        canCreate={can('FIYATLANDIRMA', 'create')}
        count={list.data?.length}
      />

      <div className="mp-note">
        Politika, doğrudan maliyetin üzerine eklenen yükleri ve hedef kâr marjını belirler. Asgari
        marjın altına inen teklifler otomatik olarak onaya düşer.
      </div>

      {list.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Politika</th>
                <th className="mp-num">Genel gider</th>
                <th className="mp-num">Müh. yükü</th>
                <th className="mp-num">Risk payı</th>
                <th className="mp-num">Hedef marj</th>
                <th className="mp-num">Asgari marj</th>
                <th>Varsayılan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.notes && <div className="mp-person__title">{p.notes}</div>}
                  </td>
                  <td className="mp-num">{formatPct(p.overheadPct, 0)}</td>
                  <td className="mp-num">{formatPct(p.engineeringPct, 0)}</td>
                  <td className="mp-num">{formatPct(p.contingencyPct, 0)}</td>
                  <td className="mp-num">{formatPct(p.targetMarginPct, 0)}</td>
                  <td className="mp-num">{formatPct(p.minMarginPct, 0)}</td>
                  <td>{p.isDefault ? 'Evet' : '-'}</td>
                  <td>
                    {can('FIYATLANDIRMA', 'edit') && (
                      <Button design="Transparent" icon="edit" onClick={() => setEditing(p)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <PolicyDialog
          policy={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            queryClient.invalidateQueries({ queryKey: ['policies'] });
          }}
        />
      )}
    </div>
  );
}

function PolicyDialog({
  policy,
  onClose,
  onSaved,
}: {
  policy: PricingPolicy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    code: policy?.code ?? '',
    name: policy?.name ?? '',
    overheadPct: policy?.overheadPct ?? 12,
    engineeringPct: policy?.engineeringPct ?? 8,
    contingencyPct: policy?.contingencyPct ?? 5,
    targetMarginPct: policy?.targetMarginPct ?? 25,
    minMarginPct: policy?.minMarginPct ?? 12,
    isDefault: policy?.isDefault ?? false,
    notes: policy?.notes ?? '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        overheadPct: num(form.overheadPct, 12),
        engineeringPct: num(form.engineeringPct, 8),
        contingencyPct: num(form.contingencyPct, 5),
        targetMarginPct: num(form.targetMarginPct, 25),
        minMarginPct: num(form.minMarginPct, 12),
      };
      return policy
        ? api.put(`/pricing/policies/${policy.id}`, payload)
        : api.post('/pricing/policies', payload);
    },
    onSuccess: () => {
      toast(policy ? 'Politika güncellendi.' : 'Politika eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText={policy ? 'Politikayı Düzenle' : 'Yeni Fiyat Politikası'}
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!form.code || !form.name}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Kod</Label>
          <Input style={{ width: '100%' }} value={form.code} onInput={(e) => set('code', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Politika adı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        {(
          [
            ['overheadPct', 'Genel üretim gideri (%)'],
            ['engineeringPct', 'Mühendislik/proje yükü (%)'],
            ['contingencyPct', 'Risk payı (%)'],
            ['targetMarginPct', 'Hedef kâr marjı (%)'],
            ['minMarginPct', 'Asgari kâr marjı (%)'],
          ] as [keyof typeof form, string][]
        ).map(([key, label]) => (
          <div key={key}>
            <Label showColon>{label}</Label>
            <Input
              type="Number"
              style={{ width: '100%' }}
              value={String(form[key])}
              onInput={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
        <div style={{ alignSelf: 'end' }}>
          <CheckBox
            text="Varsayılan politika"
            checked={form.isDefault}
            onChange={(e) => set('isDefault', e.target.checked)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Not</Label>
          <Input style={{ width: '100%' }} value={form.notes} onInput={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
