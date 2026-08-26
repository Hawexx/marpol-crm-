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
  TextArea,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  DateInput,
  AssetStatusBadge,
  CriticalityBadge,
  EmptyRow,
  Field,
  FieldGrid,
  KpiTile,
  PageHeader,
  Section,
  TicketStatusBadge,
  ASSET_STATUS_LABEL,
  CRITICALITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  daysUntil,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  today,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type {
  AssetStatus,
  Criticality,
  Customer,
  InstalledAsset,
  ServiceTicket,
  TicketStatus,
  TicketType,
} from '../api/types.js';

export default function ServicePage() {
  const summary = useQuery({
    queryKey: ['service-summary'],
    queryFn: () =>
      api.get<{ open: number; overdue: number; assets: number; dueSoon: number }>('/service/summary'),
  });

  return (
    <div className="mp-page">
      <PageHeader
        title="Saha Servis"
        subtitle="Teslimat işin başlangıcıdır: sahadaki varlıklar, servis çağrıları, ziyaretler ve periyodik bakım"
      />

      <div className="mp-kpis">
        <KpiTile label="Açık Servis Kaydı" value={summary.data?.open ?? 0} tone="info" />
        <KpiTile
          label="SLA Dışı"
          value={summary.data?.overdue ?? 0}
          tone={(summary.data?.overdue ?? 0) > 0 ? 'critical' : 'good'}
        />
        <KpiTile label="Sahadaki Varlık" value={summary.data?.assets ?? 0} tone="info" />
        <KpiTile
          label="Bakımı Yaklaşan"
          value={summary.data?.dueSoon ?? 0}
          tone={(summary.data?.dueSoon ?? 0) > 0 ? 'warning' : 'good'}
          hint="30 gün içinde"
        />
      </div>

      <TabContainer contentBackgroundDesign="Transparent">
        <Tab text="Servis Kayıtları" selected>
          <TicketsTab />
        </Tab>
        <Tab text="Sahadaki Varlıklar">
          <AssetsTab />
        </Tab>
      </TabContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TicketsTab() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['tickets', search],
    queryFn: () =>
      api.get<ServiceTicket[]>(`/service/tickets${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  if (selected) return <TicketDetail id={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Servis Kaydı"
        canCreate={can('SAHA_SERVIS', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="wrench"
          text={search ? 'Aramanızla eşleşen servis kaydı yok.' : 'Açık servis kaydı yok.'}
          hint={
            search
              ? 'Kayıt no, konu ya da müşteri adına göre arayabilirsiniz.'
              : 'Arıza, periyodik bakım ve devreye alma çağrılarını SLA süresiyle birlikte buradan izleyin.'
          }
          action={
            !search && can('SAHA_SERVIS', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>
                Yeni Servis Kaydı
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kayıt No</th>
                <th>Müşteri</th>
                <th>Varlık</th>
                <th>Tür</th>
                <th>Konu</th>
                <th>Öncelik</th>
                <th>Durum</th>
                <th>Açılış</th>
                <th>Termin (SLA)</th>
                <th>Atanan</th>
                <th className="mp-num">Ziyaret</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((t) => {
                const left = daysUntil(t.dueAt);
                const overdue =
                  left !== null && left < 0 && !['COZULDU', 'KAPANDI'].includes(t.status);
                return (
                  <tr key={t.id} className={overdue ? 'mp-row--overdue' : undefined}>
                    <td>{t.ticketNo}</td>
                    <td>{t.customer?.name}</td>
                    <td>{t.asset?.serialNo ?? '-'}</td>
                    <td>{TICKET_TYPE_LABEL[t.type]}</td>
                    <td>
                      <strong>{t.subject}</strong>
                      {t.isWarranty && <div className="mp-person__title">Garanti kapsamında</div>}
                    </td>
                    <td>
                      <CriticalityBadge level={t.priority} />
                    </td>
                    <td>
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td>{formatDate(t.openedAt)}</td>
                    <td>
                      {formatDate(t.dueAt)}
                      {overdue && <div className="mp-optgroup__req">{Math.abs(left)} gün aşım</div>}
                    </td>
                    <td>{t.assignee?.fullName ?? '-'}</td>
                    <td className="mp-num">{t._count?.visits ?? 0}</td>
                    <td>
                      <Button design="Transparent" icon="detail-view" onClick={() => setSelected(t.id)}>
                        Aç
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <TicketDialog
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

function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const [visitOpen, setVisitOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get<ServiceTicket>(`/service/tickets/${id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ticket', id] });

  const setStatus = useMutation({
    mutationFn: (status: TicketStatus) => api.patch(`/service/tickets/${id}/status`, { status }),
    onSuccess: () => {
      toast('Durum güncellendi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={5} rows={4} />
    );
  }

  const totalCost = (data.visits ?? []).reduce((s, v) => s + v.totalCost, 0);
  const billable = (data.visits ?? []).filter((v) => v.billable).reduce((s, v) => s + v.totalCost, 0);

  return (
    <div>
      <PageHeader
        title={`${data.ticketNo} · ${data.subject}`}
        subtitle={`${data.customer?.name ?? ''}${data.asset ? ` · ${data.asset.serialNo}` : ''}`}
        actions={
          <>
            {can('SAHA_SERVIS', 'create') && (
              <Button design="Emphasized" icon="add" onClick={() => setVisitOpen(true)}>
                Ziyaret ekle
              </Button>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      <div className="mp-kpis">
        <KpiTile label="Durum" value={<TicketStatusBadge status={data.status} />} tone="info" />
        <KpiTile label="Öncelik" value={<CriticalityBadge level={data.priority} />} tone="info" />
        <KpiTile label="Ziyaret" value={data.visits?.length ?? 0} tone="info" />
        <KpiTile label="Toplam Maliyet" value={formatMoney(totalCost)} tone="warning" />
        <KpiTile
          label="Faturalanacak"
          value={formatMoney(billable)}
          tone={data.isWarranty ? 'good' : 'info'}
          hint={data.isWarranty ? 'Garanti kapsamında' : undefined}
        />
      </div>

      <div className="mp-split">
        <div>
          <Section title="Saha ziyaretleri">
            {!data.visits?.length ? (
              <EmptyRow text="Ziyaret kaydı yok." />
            ) : (
              data.visits.map((v) => (
                <div key={v.id} className="mp-section" style={{ marginBottom: '0.75rem' }}>
                  <FieldGrid>
                    <Field label="Teknisyen" value={v.technician?.fullName} />
                    <Field label="Planlanan" value={formatDateTime(v.plannedAt)} />
                    <Field label="Başlangıç" value={formatDateTime(v.startedAt)} />
                    <Field label="Bitiş" value={formatDateTime(v.endedAt)} />
                    <Field label="İşçilik" value={`${formatNumber(v.laborHours, 1)} saat`} />
                    <Field label="Yol" value={`${formatNumber(v.travelKm)} km`} />
                    <Field label="Toplam maliyet" value={formatMoney(v.totalCost)} />
                    <Field label="Faturalanacak" value={v.billable ? 'Evet' : 'Hayır'} />
                    <Field label="Müşteri imzası" value={v.customerSignedBy} />
                  </FieldGrid>
                  {v.workDone && (
                    <>
                      <div className="mp-field__label" style={{ marginTop: '0.5rem' }}>Yapılan iş</div>
                      <div className="mp-field__value">{v.workDone}</div>
                    </>
                  )}
                  {v.parts && v.parts.length > 0 && (
                    <div className="mp-table-wrap" style={{ marginTop: '0.5rem' }}>
                      <table className="mp-table">
                        <thead>
                          <tr>
                            <th>Kullanılan parça</th>
                            <th className="mp-num">Miktar</th>
                            <th className="mp-num">Birim fiyat</th>
                            <th className="mp-num">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.parts.map((p) => (
                            <tr key={p.id}>
                              <td>{p.description}</td>
                              <td className="mp-num">
                                {formatNumber(p.quantity)} {p.unit}
                              </td>
                              <td className="mp-num">{formatMoney(p.unitPrice)}</td>
                              <td className="mp-num">{formatMoney(p.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </Section>
        </div>

        <div>
          <Section title="Kayıt bilgileri">
            <FieldGrid>
              <Field label="Tür" value={TICKET_TYPE_LABEL[data.type]} />
              <Field label="Açılış" value={formatDateTime(data.openedAt)} />
              <Field label="Termin (SLA)" value={formatDateTime(data.dueAt)} />
              <Field label="Kapanış" value={formatDateTime(data.closedAt)} />
              <Field label="SLA süresi" value={data.slaHours ? `${data.slaHours} saat` : '-'} />
              <Field label="Atanan" value={data.assignee?.fullName} />
              <Field label="Müşteri kişisi" value={data.contact?.fullName} />
              <Field label="Garanti" value={data.isWarranty ? 'Kapsamda' : 'Kapsam dışı'} />
            </FieldGrid>
            {data.description && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Açıklama</div>
                <div className="mp-field__value">{data.description}</div>
              </>
            )}
            {data.resolution && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Çözüm</div>
                <div className="mp-field__value">{data.resolution}</div>
              </>
            )}
          </Section>

          {can('SAHA_SERVIS', 'edit') && (
            <Section title="Durum">
              <Select
                style={{ width: '100%' }}
                onChange={(e) => setStatus.mutate(e.detail.selectedOption.dataset.value as TicketStatus)}
              >
                {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => (
                  <Option key={s} data-value={s} selected={data.status === s}>
                    {TICKET_STATUS_LABEL[s]}
                  </Option>
                ))}
              </Select>
              <div className="mp-person__title" style={{ marginTop: '0.5rem' }}>
                Periyodik bakım kaydı kapatıldığında varlığın bakım takvimi otomatik ilerler.
              </div>
            </Section>
          )}
        </div>
      </div>

      {visitOpen && (
        <VisitDialog
          ticketId={id}
          onClose={() => setVisitOpen(false)}
          onSaved={() => {
            setVisitOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VisitDialog({
  ticketId,
  onClose,
  onSaved,
}: {
  ticketId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    plannedAt: today(),
    laborHours: 0,
    travelKm: 0,
    workDone: '',
    customerSignedBy: '',
    billable: true,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const rates = useQuery({
    queryKey: ['service-rates'],
    queryFn: () => api.get<{ id: string; name: string; kind: string }[]>('/pricing/rates?kind=SAHA_SERVIS'),
  });

  const [rateId, setRateId] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api.post(`/service/tickets/${ticketId}/visits`, {
        ...form,
        rateId: rateId || null,
        laborHours: Number(form.laborHours) || 0,
        travelKm: Number(form.travelKm) || 0,
      }),
    onSuccess: () => {
      toast('Ziyaret kaydedildi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Saha Ziyareti"
      onClose={onClose}
      style={{ width: '600px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()}>Kaydet</Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label showColon>Planlanan tarih</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.plannedAt}
            onChange={(v) => set('plannedAt', v)}
          />
        </div>
        <div>
          <Label showColon>Ücret tarifesi</Label>
          <Select style={{ width: '100%' }} onChange={(e) => setRateId(e.detail.selectedOption.dataset.value as string)}>
            <Option data-value="" selected={!rateId}>(seçiniz)</Option>
            {(rates.data ?? []).map((r) => (
              <Option key={r.id} data-value={r.id} selected={rateId === r.id}>
                {r.name}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>İşçilik (saat)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.laborHours)}
            onInput={(e) => set('laborHours', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Yol (km)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.travelKm)}
            onInput={(e) => set('travelKm', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Müşteri imzası (ad soyad)</Label>
          <Input
            style={{ width: '100%' }}
            value={form.customerSignedBy}
            onInput={(e) => set('customerSignedBy', e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <CheckBox
            text="Faturalanacak"
            checked={form.billable}
            onChange={(e) => set('billable', e.target.checked)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Yapılan iş</Label>
          <TextArea style={{ width: '100%' }} rows={3} value={form.workDone} onInput={(e) => set('workDone', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function TicketDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    assetId: '',
    type: 'ARIZA' as TicketType,
    priority: 'ORTA' as Criticality,
    subject: '',
    description: '',
    isWarranty: false,
    slaHours: 24,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const assets = useQuery({
    queryKey: ['assets-lookup', form.customerId],
    queryFn: () => api.get<InstalledAsset[]>(`/service/assets?customerId=${form.customerId}`),
    enabled: Boolean(form.customerId),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/service/tickets', {
        ...form,
        assetId: form.assetId || null,
        slaHours: Number(form.slaHours) || null,
      }),
    onSuccess: () => {
      toast('Servis kaydı oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Servis Kaydı"
      onClose={onClose}
      style={{ width: '640px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.customerId || form.subject.length < 2}
              >
                Oluştur
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
          <Label showColon>Varlık</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('assetId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.assetId}>(seçilmedi)</Option>
            {(assets.data ?? []).map((a) => (
              <Option key={a.id} data-value={a.id} selected={form.assetId === a.id}>
                {a.serialNo} - {a.name}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Tür</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('type', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(TICKET_TYPE_LABEL) as TicketType[]).map((t) => (
              <Option key={t} data-value={t} selected={form.type === t}>
                {TICKET_TYPE_LABEL[t]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Öncelik</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('priority', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
              <Option key={c} data-value={c} selected={form.priority === c}>
                {CRITICALITY_LABEL[c]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>SLA (saat)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.slaHours)}
            onInput={(e) => set('slaHours', e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <CheckBox
            text="Garanti kapsamında"
            checked={form.isWarranty}
            onChange={(e) => set('isWarranty', e.target.checked)}
          />
        </div>
        <div className="mp-form__full">
          <Label required showColon>Konu</Label>
          <Input style={{ width: '100%' }} value={form.subject} onInput={(e) => set('subject', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Açıklama</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            value={form.description}
            onInput={(e) => set('description', e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function AssetsTab() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['assets', search],
    queryFn: () =>
      api.get<InstalledAsset[]>(`/service/assets${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div>
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Varlık"
        canCreate={can('SAHA_SERVIS', 'create')}
        count={list.data?.length}
      />

      <div className="mp-note">
        Teslim edilen her makine/sistem burada izlenir. Bakım aralığı girilen varlıkların bir sonraki
        bakım tarihi otomatik hesaplanır ve proaktif servis satışı için listelenir.
      </div>

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="machine"
          text={search ? 'Aramanızla eşleşen varlık yok.' : 'Sahada kayıtlı varlık yok.'}
          hint="Teslim edilen her makineyi kaydettiğinizde garanti ve bakım takvimi otomatik izlenir."
          action={
            !search && can('SAHA_SERVIS', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>
                Yeni Varlık
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Seri No</th>
                <th>Varlık</th>
                <th>Müşteri</th>
                <th>Konum</th>
                <th>Durum</th>
                <th>Devreye alma</th>
                <th>Garanti bitiş</th>
                <th>Sonraki bakım</th>
                <th className="mp-num">Servis</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => {
                const warrantyLeft = daysUntil(a.warrantyEnd);
                const serviceLeft = daysUntil(a.nextServiceAt);
                return (
                  <tr key={a.id} className={serviceLeft !== null && serviceLeft < 0 ? 'mp-row--overdue' : undefined}>
                    <td>{a.serialNo}</td>
                    <td>
                      <strong>{a.name}</strong>
                      {a.notes && <div className="mp-person__title">{a.notes}</div>}
                    </td>
                    <td>{a.customer?.name}</td>
                    <td>{a.location ?? '-'}</td>
                    <td>
                      <AssetStatusBadge status={a.status} />
                    </td>
                    <td>{formatDate(a.commissionedAt ?? a.installedAt)}</td>
                    <td>
                      {formatDate(a.warrantyEnd)}
                      {warrantyLeft !== null && warrantyLeft < 0 && (
                        <div className="mp-person__title">Garanti dışı</div>
                      )}
                    </td>
                    <td>
                      {formatDate(a.nextServiceAt)}
                      {serviceLeft !== null && serviceLeft < 0 && (
                        <div className="mp-optgroup__req">{Math.abs(serviceLeft)} gün gecikti</div>
                      )}
                    </td>
                    <td className="mp-num">{a._count?.tickets ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <AssetDialog
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

function AssetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    serialNo: '',
    customerId: '',
    name: '',
    location: '',
    installedAt: today(),
    commissionedAt: '',
    warrantyStart: '',
    warrantyEnd: '',
    status: 'CALISIYOR' as AssetStatus,
    maintenanceIntervalMonths: 6,
    notes: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/service/assets', {
        ...form,
        commissionedAt: form.commissionedAt || null,
        warrantyStart: form.warrantyStart || null,
        warrantyEnd: form.warrantyEnd || null,
        maintenanceIntervalMonths: Number(form.maintenanceIntervalMonths) || null,
      }),
    onSuccess: () => {
      toast('Varlık kaydedildi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Saha Varlığı"
      onClose={onClose}
      style={{ width: '640px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.serialNo || !form.customerId || form.name.length < 2}
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
          <Label required showColon>Seri no</Label>
          <Input style={{ width: '100%' }} value={form.serialNo} onInput={(e) => set('serialNo', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Varlık adı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
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
          <Label showColon>Konum</Label>
          <Input style={{ width: '100%' }} value={form.location} onInput={(e) => set('location', e.target.value)} />
        </div>
        <div>
          <Label showColon>Kurulum tarihi</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.installedAt}
            onChange={(v) => set('installedAt', v)}
          />
        </div>
        <div>
          <Label showColon>Devreye alma</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.commissionedAt}
            onChange={(v) => set('commissionedAt', v)}
          />
        </div>
        <div>
          <Label showColon>Garanti başlangıç</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.warrantyStart}
            onChange={(v) => set('warrantyStart', v)}
          />
        </div>
        <div>
          <Label showColon>Garanti bitiş</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.warrantyEnd}
            onChange={(v) => set('warrantyEnd', v)}
          />
        </div>
        <div>
          <Label showColon>Durum</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('status', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <Option key={s} data-value={s} selected={form.status === s}>
                {ASSET_STATUS_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Bakım aralığı (ay)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.maintenanceIntervalMonths)}
            onInput={(e) => set('maintenanceIntervalMonths', e.target.value)}
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
