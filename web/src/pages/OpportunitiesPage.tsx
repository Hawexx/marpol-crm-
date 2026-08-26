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
  TextArea,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useConfirm } from '../components/confirm.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  DateInput,
  EmptyRow,
  Field,
  FieldGrid,
  InfluenceMeter,
  KpiTile,
  PageHeader,
  Section,
  SentimentBadge,
  StageBadge,
  DEPARTMENT_LABEL,
  STAGE_LABEL,
  STAGE_ORDER,
  STAKEHOLDER_ROLE_LABEL,
  formatDate,
  formatMoney,
  revisionLabel,
  num,
  NEGOTIATION_LABEL,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type {
  Contact,
  Customer,
  Opportunity,
  OpportunityStage,
  Sentiment,
  StakeholderRole,
} from '../api/types.js';

export default function OpportunitiesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'pipeline' | 'liste'>('pipeline');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['opportunities', search],
    queryFn: () =>
      api.get<Opportunity[]>(`/opportunities${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const summary = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: () =>
      api.get<{
        byStage: Record<string, { count: number; value: number; weighted: number }>;
        totalValue: number;
        weightedValue: number;
        openCount: number;
      }>('/opportunities/pipeline/summary'),
  });

  if (selected) {
    return <OpportunityDetail id={selected} onBack={() => setSelected(null)} />;
  }

  const openStages = STAGE_ORDER.filter((s) => s !== 'KAZANILDI' && s !== 'KAYBEDILDI');

  return (
    <div className="mp-page">
      <PageHeader
        title="Fırsatlar"
        subtitle="Uzun satış döngüsü takibi: aşamalar, paydaş haritası ve ağırlıklı pipeline"
      />

      <div className="mp-kpis">
        <KpiTile label="Açık Fırsat" value={summary.data?.openCount ?? 0} tone="info" />
        <KpiTile label="Toplam Pipeline" value={formatMoney(summary.data?.totalValue ?? 0)} tone="info" />
        <KpiTile
          label="Ağırlıklı Pipeline"
          value={formatMoney(summary.data?.weightedValue ?? 0)}
          tone="good"
          hint="Olasılıkla çarpılmış beklenen değer"
        />
      </div>

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          list.refetch();
          summary.refetch();
        }}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Fırsat"
        canCreate={can('FIRSATLAR', 'create')}
        count={list.data?.length}
        extra={
          <Select
            style={{ width: '150px' }}
            onChange={(e) => setView(e.detail.selectedOption.dataset.value as 'pipeline' | 'liste')}
          >
            <Option data-value="pipeline" selected={view === 'pipeline'}>Huni görünümü</Option>
            <Option data-value="liste" selected={view === 'liste'}>Liste görünümü</Option>
          </Select>
        }
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : view === 'pipeline' ? (
        <div className="mp-pipeline">
          {openStages.map((stage) => {
            const items = (list.data ?? []).filter((o) => o.stage === stage);
            const value = items.reduce((s, o) => s + o.expectedValue, 0);
            return (
              <div key={stage} className="mp-stage">
                <div className="mp-stage__head">
                  <span className="mp-stage__title">{STAGE_LABEL[stage]}</span>
                  <span className="mp-stage__count">{items.length}</span>
                </div>
                <div className="mp-stage__value">{formatMoney(value)}</div>
                {items.map((o) => (
                  <div
                    key={o.id}
                    className="mp-opp-card mp-opp-card--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(o.id);
                      }
                    }}
                  >
                    <div className="mp-opp-card__title">{o.title}</div>
                    <div className="mp-opp-card__meta">{o.customer?.name}</div>
                    <div className="mp-opp-card__value">{formatMoney(o.expectedValue, o.currency)}</div>
                    <div className="mp-opp-card__meta">
                      %{o.probability} · {formatDate(o.expectedCloseDate)}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="mp-empty">-</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Başlık</th>
                <th>Müşteri</th>
                <th>Aşama</th>
                <th className="mp-num">Olasılık</th>
                <th className="mp-num">Beklenen değer</th>
                <th>Kapanış</th>
                <th>Rakip</th>
                <th>Sorumlu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((o) => (
                <tr key={o.id}>
                  <td>{o.code}</td>
                  <td>
                    <strong>{o.title}</strong>
                  </td>
                  <td>{o.customer?.name}</td>
                  <td>
                    <StageBadge stage={o.stage} />
                  </td>
                  <td className="mp-num">%{o.probability}</td>
                  <td className="mp-num">{formatMoney(o.expectedValue, o.currency)}</td>
                  <td>{formatDate(o.expectedCloseDate)}</td>
                  <td>{o.competitor ?? '-'}</td>
                  <td>{o.owner?.fullName ?? '-'}</td>
                  <td>
                    <Button design="Transparent" icon="detail-view" onClick={() => setSelected(o.id)}>
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
        <OpportunityDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.refetch();
            summary.refetch();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fırsat detayı - paydaş haritası ve aşama geçmişi
// ---------------------------------------------------------------------------

function OpportunityDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const { confirm, confirmDialog } = useConfirm();
  const [stageOpen, setStageOpen] = useState(false);
  const [stakeholderOpen, setStakeholderOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => api.get<Opportunity>(`/opportunities/${id}`),
  });

  const removeStakeholder = useMutation({
    mutationFn: (sid: string) => api.delete(`/opportunities/stakeholders/${sid}`),
    onSuccess: () => {
      toast('Paydaş kaldırıldı.');
      queryClient.invalidateQueries({ queryKey: ['opportunity', id] });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={5} rows={5} />
    );
  }

  const customer = data.customer as unknown as Customer | undefined;

  return (
    <div className="mp-page">
      <PageHeader
        title={data.title}
        subtitle={`${data.code} · ${customer?.name ?? ''}`}
        actions={
          <>
            {can('FIRSATLAR', 'edit') && (
              <Button design="Emphasized" icon="status-positive" onClick={() => setStageOpen(true)}>
                Aşama değiştir
              </Button>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      <div className="mp-kpis">
        <KpiTile label="Aşama" value={<StageBadge stage={data.stage} />} tone="info" />
        <KpiTile label="Kazanma Olasılığı" value={`%${data.probability}`} tone="info" />
        <KpiTile label="Beklenen Değer" value={formatMoney(data.expectedValue, data.currency)} tone="good" />
        <KpiTile
          label="Ağırlıklı Değer"
          value={formatMoney(data.expectedValue * (data.probability / 100), data.currency)}
          tone="good"
        />
        <KpiTile
          label="Döngü Süresi"
          value={`${Math.floor((Date.now() - new Date(data.openedAt).getTime()) / 86_400_000)} gün`}
          tone="info"
          hint={`Açılış: ${formatDate(data.openedAt)}`}
        />
      </div>

      <div className="mp-split">
        <div>
          <Section
            title="Paydaş haritası"
            actions={
              can('FIRSATLAR', 'edit') && (
                <Button design="Emphasized" icon="add" onClick={() => setStakeholderOpen(true)}>
                  Paydaş ekle
                </Button>
              )
            }
          >
            <div className="mp-note">
              Bu fırsatta kim karar verici, kim teknik onaycı, kim bütçeyi onaylıyor — masadaki
              herkesin rolü ve tutumu burada tutulur.
            </div>
            {!data.stakeholders?.length ? (
              <EmptyRow
                icon="org-chart"
                text="Paydaş eklenmemiş"
                hint="Karar verici, teknik onaycı ve bütçe sahibini işaretlemek satış stratejisinin temelidir."
                action={
                  can('FIRSATLAR', 'edit') ? (
                    <Button design="Emphasized" icon="add" onClick={() => setStakeholderOpen(true)}>
                      Paydaş ekle
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kişi</th>
                      <th>Departman</th>
                      <th>Bu fırsattaki rolü</th>
                      <th>Etki</th>
                      <th>Tutum</th>
                      <th>Pazarlık tarzı</th>
                      <th>Not</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.stakeholders.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.contact.fullName}</strong>
                          <div className="mp-person__title">{s.contact.title ?? ''}</div>
                        </td>
                        <td>{DEPARTMENT_LABEL[s.contact.department]}</td>
                        <td>{STAKEHOLDER_ROLE_LABEL[s.role]}</td>
                        <td>
                          <InfluenceMeter value={s.influence} />
                        </td>
                        <td>
                          <SentimentBadge sentiment={s.sentiment} />
                        </td>
                        <td>
                          {s.contact.negotiationStyle
                            ? NEGOTIATION_LABEL[s.contact.negotiationStyle]
                            : '-'}
                        </td>
                        <td>{s.notes ?? '-'}</td>
                        <td>
                          {can('FIRSATLAR', 'edit') && (
                            <Button
                              design="Transparent"
                              icon="delete"
                              tooltip="Paydaşı kaldır"
                              accessibleName={`${s.contact.fullName} paydaşını kaldır`}
                              onClick={() =>
                                confirm({
                                  title: 'Paydaşı kaldır',
                                  text: `${s.contact.fullName}, bu fırsatın paydaş haritasından çıkarılacak.`,
                                  confirmLabel: 'Kaldır',
                                  onConfirm: () => removeStakeholder.mutate(s.id),
                                })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Teklifler">
            {!data.quotes?.length ? (
              <EmptyRow text="Bu fırsata bağlı teklif yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Teklif No</th>
                      <th>Revizyon</th>
                      <th>Başlık</th>
                      <th>Durum</th>
                      <th className="mp-num">Tutar</th>
                      <th className="mp-num">Marj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quotes.map((q) => (
                      <tr key={q.id} style={{ opacity: q.isCurrent ? 1 : 0.6 }}>
                        <td>{q.quoteNo}</td>
                        <td>
                          {revisionLabel(q.revision)}
                          {q.isCurrent ? ' (güncel)' : ''}
                        </td>
                        <td>{q.title}</td>
                        <td>{q.status}</td>
                        <td className="mp-num">{formatMoney(q.totalPrice, q.currency)}</td>
                        <td className="mp-num">%{q.marginPct.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Son etkileşimler">
            {!data.interactions?.length ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Konu</th>
                      <th>Kişi</th>
                      <th>Sonuç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.interactions.map((i) => (
                      <tr key={i.id}>
                        <td>{formatDate(i.occurredAt)}</td>
                        <td>{i.subject}</td>
                        <td>{i.contact?.fullName ?? '-'}</td>
                        <td>{i.outcome ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Fırsat bilgileri">
            <FieldGrid>
              <Field label="Kaynak" value={data.source} />
              <Field label="Rakip" value={data.competitor} />
              <Field label="Açılış" value={formatDate(data.openedAt)} />
              <Field label="Beklenen kapanış" value={formatDate(data.expectedCloseDate)} />
              <Field label="Sorumlu" value={data.owner?.fullName} />
              {data.lossReason && <Field label="Kayıp gerekçesi" value={data.lossReason} />}
            </FieldGrid>
            {data.description && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Açıklama</div>
                <div className="mp-field__value">{data.description}</div>
              </>
            )}
          </Section>

          <Section title="Aşama geçmişi">
            {!data.stageHistory?.length ? (
              <EmptyRow />
            ) : (
              data.stageHistory.map((h) => (
                <div key={h.id} className="mp-opp-card">
                  <div className="mp-opp-card__title">
                    {h.fromStage ? `${STAGE_LABEL[h.fromStage]} → ` : ''}
                    {STAGE_LABEL[h.toStage]}
                  </div>
                  <div className="mp-opp-card__meta">{formatDate(h.changedAt)}</div>
                  {h.note && <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{h.note}</div>}
                </div>
              ))
            )}
          </Section>
        </div>
      </div>

      {confirmDialog}

      {stageOpen && (
        <StageDialog
          opportunity={data}
          onClose={() => setStageOpen(false)}
          onSaved={() => {
            setStageOpen(false);
            queryClient.invalidateQueries({ queryKey: ['opportunity', id] });
          }}
        />
      )}

      {stakeholderOpen && customer && (
        <StakeholderDialog
          opportunityId={id}
          customerId={data.customerId}
          existing={data.stakeholders?.map((s) => s.contactId) ?? []}
          onClose={() => setStakeholderOpen(false)}
          onSaved={() => {
            setStakeholderOpen(false);
            queryClient.invalidateQueries({ queryKey: ['opportunity', id] });
          }}
        />
      )}
    </div>
  );
}

function StageDialog({
  opportunity,
  onClose,
  onSaved,
}: {
  opportunity: Opportunity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [stage, setStage] = useState<OpportunityStage>(opportunity.stage);
  const [note, setNote] = useState('');
  const [lossReason, setLossReason] = useState(opportunity.lossReason ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/opportunities/${opportunity.id}/stage`, { stage, note, lossReason }),
    onSuccess: () => {
      toast('Aşama güncellendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Aşama Değiştir"
      onClose={onClose}
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
      <div style={{ display: 'grid', gap: '0.75rem', width: '420px', padding: '0.5rem 0' }}>
        <div>
          <Label showColon>Yeni aşama</Label>
          <Select
            style={{ width: '100%' }}
            onChange={(e) => setStage(e.detail.selectedOption.dataset.value as OpportunityStage)}
          >
            {STAGE_ORDER.map((s) => (
              <Option key={s} data-value={s} selected={stage === s}>
                {STAGE_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        {stage === 'KAYBEDILDI' && (
          <div>
            <Label showColon>Kayıp gerekçesi</Label>
            <TextArea
              style={{ width: '100%' }}
              rows={2}
              value={lossReason}
              onInput={(e) => setLossReason(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label showColon>Not</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={note} onInput={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function StakeholderDialog({
  opportunityId,
  customerId,
  existing,
  onClose,
  onSaved,
}: {
  opportunityId: string;
  customerId: string;
  existing: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState<StakeholderRole>('ETKILEYICI');
  const [influence, setInfluence] = useState(3);
  const [sentiment, setSentiment] = useState<Sentiment>('NOTR');
  const [notes, setNotes] = useState('');

  const contacts = useQuery({
    queryKey: ['contacts', customerId],
    queryFn: () => api.get<Contact[]>(`/customers/${customerId}/contacts`),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post(`/opportunities/${opportunityId}/stakeholders`, {
        contactId,
        role,
        influence: num(influence, 3),
        sentiment,
        notes,
      }),
    onSuccess: () => {
      toast('Paydaş eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const available = (contacts.data ?? []).filter((c) => !existing.includes(c.id));

  return (
    <Dialog
      open
      headerText="Paydaş Ekle"
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!contactId}>
                Ekle
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '440px', padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Kişi</Label>
          <Select style={{ width: '100%' }} onChange={(e) => setContactId(e.detail.selectedOption.dataset.value as string)}>
            <Option data-value="" selected={!contactId}>(seçiniz)</Option>
            {available.map((c) => (
              <Option key={c.id} data-value={c.id} selected={contactId === c.id}>
                {c.fullName} - {c.title ?? DEPARTMENT_LABEL[c.department]}
              </Option>
            ))}
          </Select>
          {available.length === 0 && (
            <div className="mp-person__title">
              Eklenebilecek kişi kalmadı. Önce müşteri kartından kişi ekleyin.
            </div>
          )}
        </div>
        <div>
          <Label showColon>Bu fırsattaki rolü</Label>
          <Select style={{ width: '100%' }} onChange={(e) => setRole(e.detail.selectedOption.dataset.value as StakeholderRole)}>
            {(Object.keys(STAKEHOLDER_ROLE_LABEL) as StakeholderRole[]).map((r) => (
              <Option key={r} data-value={r} selected={role === r}>
                {STAKEHOLDER_ROLE_LABEL[r]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Etki gücü (1-5)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(influence)}
            onInput={(e) => setInfluence(Number(e.target.value))}
          />
        </div>
        <div>
          <Label showColon>Tutum</Label>
          <Select style={{ width: '100%' }} onChange={(e) => setSentiment(e.detail.selectedOption.dataset.value as Sentiment)}>
            <Option data-value="DESTEKLIYOR" selected={sentiment === 'DESTEKLIYOR'}>Destekliyor</Option>
            <Option data-value="NOTR" selected={sentiment === 'NOTR'}>Nötr</Option>
            <Option data-value="KARSIT" selected={sentiment === 'KARSIT'}>Karşıt</Option>
          </Select>
        </div>
        <div>
          <Label showColon>Not</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={notes} onInput={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function OpportunityDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    title: '',
    description: '',
    stage: 'KESIF' as OpportunityStage,
    expectedValue: 0,
    expectedCloseDate: '',
    source: '',
    competitor: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/opportunities', {
        ...form,
        expectedValue: num(form.expectedValue),
        expectedCloseDate: form.expectedCloseDate || null,
      }),
    onSuccess: () => {
      toast('Fırsat oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Fırsat"
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
                disabled={!form.customerId || form.title.length < 2}
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
          <Label required showColon>Başlık</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>Aşama</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('stage', e.detail.selectedOption.dataset.value)}>
            {STAGE_ORDER.filter((s) => s !== 'KAZANILDI' && s !== 'KAYBEDILDI').map((s) => (
              <Option key={s} data-value={s} selected={form.stage === s}>
                {STAGE_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Beklenen değer</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.expectedValue)}
            onInput={(e) => set('expectedValue', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Beklenen kapanış</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.expectedCloseDate}
            onChange={(v) => set('expectedCloseDate', v)}
          />
        </div>
        <div>
          <Label showColon>Kaynak</Label>
          <Input style={{ width: '100%' }} value={form.source} onInput={(e) => set('source', e.target.value)} />
        </div>
        <div>
          <Label showColon>Rakip</Label>
          <Input style={{ width: '100%' }} value={form.competitor} onInput={(e) => set('competitor', e.target.value)} />
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
