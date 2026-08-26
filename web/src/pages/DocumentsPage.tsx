import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  Dialog,
  Input,
  Label,
  Option,
  Select,
  Tab,
  TabContainer,
  TextArea,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  DateInput,
  ComplianceBadge,
  CriticalityBadge,
  EmptyRow,
  KpiTile,
  PageHeader,
  ProgressBar,
  Section,
  COMPLIANCE_LABEL,
  CRITICALITY_LABEL,
  DOCUMENT_TYPE_LABEL,
  formatDate,
  safeExternalUrl,
  today,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type {
  AppDocument,
  ComplianceStatus,
  Criticality,
  Customer,
  DocumentType,
  SpecDocument,
} from '../api/types.js';

export default function DocumentsPage() {
  return (
    <div className="mp-page">
      <PageHeader
        title="Doküman ve Teknik Şartname"
        subtitle="Müşteri şartnameleri, uygunluk matrisi (compliance matrix) ve proje dokümanları"
      />
      <TabContainer contentBackgroundDesign="Transparent">
        <Tab text="Teknik Şartnameler" selected>
          <SpecsTab />
        </Tab>
        <Tab text="Dokümanlar">
          <DocsTab />
        </Tab>
      </TabContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SpecsTab() {
  const { can } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['specs'],
    queryFn: () => api.get<SpecDocument[]>('/documents/specs'),
  });

  if (selected) return <SpecDetail id={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <DataToolbar
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Şartname"
        canCreate={can('DOKUMANLAR', 'create')}
        count={list.data?.length}
      />

      <div className="mp-note">
        Müşteriden gelen şartnamelerin hangi maddelerinin karşılandığı satış aşamasında eşleştirilir.
        Kritik ve karşılanmayan maddeler teklifin en büyük riskidir.
      </div>

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow text="Şartname kaydı yok." />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Doküman no</th>
                <th>Başlık</th>
                <th>Müşteri</th>
                <th>Fırsat</th>
                <th>Rev.</th>
                <th>Geliş</th>
                <th className="mp-num">Madde</th>
                <th style={{ minWidth: 120 }}>Uygunluk</th>
                <th className="mp-num">Kritik açık</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.docNo ?? '-'}</td>
                  <td>
                    <strong>{s.title}</strong>
                  </td>
                  <td>{s.customer?.name}</td>
                  <td>{s.opportunity?.title ?? '-'}</td>
                  <td>{s.revision}</td>
                  <td>{formatDate(s.receivedAt)}</td>
                  <td className="mp-num">{s.summary?.total ?? 0}</td>
                  <td>
                    <ProgressBar
                      value={s.summary?.compliancePct ?? 0}
                      tone={
                        (s.summary?.compliancePct ?? 0) >= 90
                          ? 'good'
                          : (s.summary?.compliancePct ?? 0) >= 70
                            ? 'warning'
                            : 'critical'
                      }
                    />
                  </td>
                  <td className="mp-num">
                    {s.summary?.criticalGaps ? (
                      <strong style={{ color: 'var(--sapNegativeTextColor)' }}>
                        {s.summary.criticalGaps}
                      </strong>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td>
                    <Button design="Transparent" icon="detail-view" onClick={() => setSelected(s.id)}>
                      Aç
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <SpecDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

function SpecDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const [reqOpen, setReqOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['spec', id],
    queryFn: () => api.get<SpecDocument>(`/documents/specs/${id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['spec', id] });

  const updateStatus = useMutation({
    mutationFn: ({ reqId, status }: { reqId: string; status: ComplianceStatus }) =>
      api.put(`/documents/requirements/${reqId}`, { status }),
    onSuccess: () => {
      toast('Madde durumu güncellendi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={7} rows={6} />
    );
  }

  const s = data.summary;

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={`${data.docNo ?? ''} Rev ${data.revision} · ${data.customer?.name ?? ''}`}
        actions={
          <>
            {can('DOKUMANLAR', 'create') && (
              <Button design="Emphasized" icon="add" onClick={() => setReqOpen(true)}>
                Madde ekle
              </Button>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      <div className="mp-kpis">
        <KpiTile label="Toplam Madde" value={s?.total ?? 0} tone="info" />
        <KpiTile label="Karşılanıyor" value={s?.met ?? 0} tone="good" />
        <KpiTile label="Kısmen" value={s?.partial ?? 0} tone="warning" />
        <KpiTile label="Karşılanmıyor" value={s?.notMet ?? 0} tone="critical" />
        <KpiTile label="Değerlendiriliyor" value={s?.open ?? 0} tone="info" />
        <KpiTile
          label="Uygunluk Oranı"
          value={`%${s?.compliancePct ?? 0}`}
          tone={(s?.compliancePct ?? 0) >= 90 ? 'good' : (s?.compliancePct ?? 0) >= 70 ? 'warning' : 'critical'}
          hint="Kapsam dışı maddeler hariç"
        />
        <KpiTile
          label="Kritik Açık"
          value={s?.criticalGaps ?? 0}
          tone={(s?.criticalGaps ?? 0) > 0 ? 'critical' : 'good'}
          hint="Yüksek/kritik + karşılanmıyor"
        />
      </div>

      <Section title="Uygunluk matrisi (Compliance Matrix)">
        {!data.requirements?.length ? (
          <EmptyRow text="Madde eklenmemiş." />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Madde</th>
                  <th>Şartname metni</th>
                  <th>Kategori</th>
                  <th>Kritiklik</th>
                  <th>Durum</th>
                  <th>Marpol cevabı</th>
                  <th>Sapma / alternatif</th>
                  <th>Sorumlu</th>
                  {can('DOKUMANLAR', 'edit') && <th style={{ width: 190 }}>Durumu değiştir</th>}
                </tr>
              </thead>
              <tbody>
                {data.requirements.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.status === 'KARSILANMIYOR' && (r.criticality === 'KRITIK' || r.criticality === 'YUKSEK')
                        ? 'mp-row--overdue'
                        : undefined
                    }
                  >
                    <td>
                      <strong>{r.clauseNo}</strong>
                    </td>
                    <td style={{ maxWidth: 340 }}>{r.text}</td>
                    <td>{r.category ?? '-'}</td>
                    <td>
                      <CriticalityBadge level={r.criticality} />
                    </td>
                    <td>
                      <ComplianceBadge status={r.status} />
                    </td>
                    <td style={{ maxWidth: 260 }}>{r.response ?? '-'}</td>
                    <td style={{ maxWidth: 260 }}>{r.deviation ?? '-'}</td>
                    <td>{r.owner?.fullName ?? '-'}</td>
                    {can('DOKUMANLAR', 'edit') && (
                      <td>
                        <Select
                          style={{ width: '100%' }}
                          onChange={(e) =>
                            updateStatus.mutate({
                              reqId: r.id,
                              status: e.detail.selectedOption.dataset.value as ComplianceStatus,
                            })
                          }
                        >
                          {(Object.keys(COMPLIANCE_LABEL) as ComplianceStatus[]).map((c) => (
                            <Option key={c} data-value={c} selected={r.status === c}>
                              {COMPLIANCE_LABEL[c]}
                            </Option>
                          ))}
                        </Select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {reqOpen && (
        <RequirementDialog
          specId={id}
          onClose={() => setReqOpen(false)}
          onSaved={() => {
            setReqOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RequirementDialog({
  specId,
  onClose,
  onSaved,
}: {
  specId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    clauseNo: '',
    text: '',
    category: '',
    criticality: 'ORTA' as Criticality,
    status: 'DEGERLENDIRILIYOR' as ComplianceStatus,
    response: '',
    deviation: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => api.post(`/documents/specs/${specId}/requirements`, form),
    onSuccess: () => {
      toast('Madde eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Şartname Maddesi Ekle"
      onClose={onClose}
      style={{ width: '660px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.clauseNo || form.text.length < 2}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Madde no</Label>
          <Input style={{ width: '100%' }} value={form.clauseNo} onInput={(e) => set('clauseNo', e.target.value)} />
        </div>
        <div>
          <Label showColon>Kategori</Label>
          <Input style={{ width: '100%' }} value={form.category} onInput={(e) => set('category', e.target.value)} />
        </div>
        <div>
          <Label showColon>Kritiklik</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('criticality', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
              <Option key={c} data-value={c} selected={form.criticality === c}>
                {CRITICALITY_LABEL[c]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Durum</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('status', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(COMPLIANCE_LABEL) as ComplianceStatus[]).map((c) => (
              <Option key={c} data-value={c} selected={form.status === c}>
                {COMPLIANCE_LABEL[c]}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Şartname metni</Label>
          <TextArea style={{ width: '100%' }} rows={3} value={form.text} onInput={(e) => set('text', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Marpol cevabı</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={form.response} onInput={(e) => set('response', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Sapma / önerilen alternatif</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={form.deviation} onInput={(e) => set('deviation', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function SpecDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    title: '',
    docNo: '',
    revision: 'A',
    receivedAt: today(),
    notes: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const save = useMutation({
    mutationFn: () => api.post('/documents/specs', form),
    onSuccess: () => {
      toast('Şartname eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Teknik Şartname"
      onClose={onClose}
      style={{ width: '600px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.customerId || form.title.length < 2}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div className="mp-form__full">
          <Label required showColon>Müşteri</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('customerId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.customerId}>(seçiniz)</Option>
            {(customers.data ?? []).map((c) => (
              <Option key={c.id} data-value={c.id} selected={form.customerId === c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Başlık</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>Doküman no</Label>
          <Input style={{ width: '100%' }} value={form.docNo} onInput={(e) => set('docNo', e.target.value)} />
        </div>
        <div>
          <Label showColon>Revizyon</Label>
          <Input style={{ width: '100%' }} value={form.revision} onInput={(e) => set('revision', e.target.value)} />
        </div>
        <div>
          <Label showColon>Geliş tarihi</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.receivedAt}
            onChange={(v) => set('receivedAt', v)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Notlar</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={form.notes} onInput={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * Doküman bağlantısı.
 *
 * `fileUrl` kullanıcının serbestçe girdiği bir metindir. Doğrudan `href`e
 * verilirse `javascript:` adresi kaydeden biri, bağlantıya tıklayan herkesin
 * oturum anahtarını çalabilir. Yalnızca http/https bağlantı olarak basılır;
 * geri kalanı düz metindir.
 */
function DocumentLink({ url, label }: { url?: string | null; label?: string | null }) {
  const safe = safeExternalUrl(url);
  if (!safe) {
    return (
      <>
        {label ?? (url ? <span title={url}>Geçersiz bağlantı</span> : '-')}
      </>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {label ?? 'Bağlantı'}
    </a>
  );
}

function DocsTab() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['documents', search],
    queryFn: () => api.get<AppDocument[]>(`/documents${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Doküman"
        canCreate={can('DOKUMANLAR', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow text="Doküman kaydı yok." />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Doküman no</th>
                <th>Başlık</th>
                <th>Tür</th>
                <th>Sürüm</th>
                <th>Müşteri</th>
                <th>Fırsat</th>
                <th>Dosya</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.id}>
                  <td>{d.docNo ?? '-'}</td>
                  <td>
                    <strong>{d.title}</strong>
                  </td>
                  <td>{DOCUMENT_TYPE_LABEL[d.type]}</td>
                  <td>{d.version}</td>
                  <td>{d.customer?.name ?? '-'}</td>
                  <td>{d.opportunity?.title ?? '-'}</td>
                  <td>
                    <DocumentLink url={d.fileUrl} label={d.fileName} />
                  </td>
                  <td>{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <DocumentDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

function DocumentDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    type: 'DIGER' as DocumentType,
    title: '',
    docNo: '',
    version: '1.0',
    fileName: '',
    fileUrl: '',
    notes: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const save = useMutation({
    mutationFn: () => api.post('/documents', { ...form, customerId: form.customerId || null }),
    onSuccess: () => {
      toast('Doküman eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Doküman"
      onClose={onClose}
      style={{ width: '600px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={form.title.length < 2}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div className="mp-form__full">
          <Label showColon>Müşteri</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('customerId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.customerId}>(genel)</Option>
            {(customers.data ?? []).map((c) => (
              <Option key={c.id} data-value={c.id} selected={form.customerId === c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Başlık</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>Tür</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('type', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((t) => (
              <Option key={t} data-value={t} selected={form.type === t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Doküman no</Label>
          <Input style={{ width: '100%' }} value={form.docNo} onInput={(e) => set('docNo', e.target.value)} />
        </div>
        <div>
          <Label showColon>Sürüm</Label>
          <Input style={{ width: '100%' }} value={form.version} onInput={(e) => set('version', e.target.value)} />
        </div>
        <div>
          <Label showColon>Dosya adı</Label>
          <Input style={{ width: '100%' }} value={form.fileName} onInput={(e) => set('fileName', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Bağlantı (paylaşılan sürücü / DMS)</Label>
          <Input style={{ width: '100%' }} value={form.fileUrl} onInput={(e) => set('fileUrl', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Notlar</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={form.notes} onInput={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
