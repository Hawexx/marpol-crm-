import { useMemo, useState } from 'react';
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
  CustomerStatusBadge,
  EmptyRow,
  Field,
  FieldGrid,
  InfluenceMeter,
  KpiTile,
  PageHeader,
  Section,
  SentimentBadge,
  CUSTOMER_STATUS_LABEL,
  DEPARTMENT_LABEL,
  INTERACTION_LABEL,
  NEGOTIATION_HINT,
  NEGOTIATION_LABEL,
  PRICE_SENSITIVITY_LABEL,
  STAKEHOLDER_ROLE_LABEL,
  formatDate,
  formatMoney,
  formatPct,
  revisionLabel,
  today,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type {
  BehaviorRow,
  Contact,
  Customer,
  CustomerStatus,
  InteractionType,
  NegotiationStyle,
  PriceSensitivity,
  Recommendation,
  Sentiment,
  StakeholderDepartment,
  StakeholderRole,
} from '../api/types.js';

export default function CustomersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);

  const list = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get<Customer[]>(`/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  if (selected) {
    return <CustomerDetail id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="mp-page">
      <PageHeader
        title="Müşteriler"
        subtitle="Firma bilgileri, yetkili kişiler, pazarlık davranışı ve geçmiş kayıtlar"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setEditing(null)}
        createLabel="Yeni Müşteri"
        canCreate={can('MUSTERILER', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="customer"
          text={search ? 'Aramanızla eşleşen müşteri yok.' : 'Henüz müşteri kaydı yok.'}
          hint={
            search
              ? 'Firma unvanı, kod, sektör, şehir ya da yetkili kişi adına göre arayabilirsiniz.'
              : 'İlk firmayı ekleyerek paydaş haritası, teklif ve sipariş geçmişini tek kartta toplayın.'
          }
          action={
            !search && can('MUSTERILER', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setEditing(null)}>
                Yeni Müşteri
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Firma</th>
                <th>Sektör</th>
                <th>Şehir</th>
                <th>Durum</th>
                <th>Pazarlık Tarzı</th>
                <th>Temsilci</th>
                <th className="mp-num">Kişi</th>
                <th className="mp-num">Fırsat</th>
                <th className="mp-num">Sipariş</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>
                    <strong>{c.name}</strong>
                    {c.contacts?.[0] && (
                      <div className="mp-person__title">
                        {c.contacts[0].fullName}
                        {c.contacts[0].phone ? ` · ${c.contacts[0].phone}` : ''}
                      </div>
                    )}
                  </td>
                  <td>{c.industry ?? '-'}</td>
                  <td>{c.city ?? '-'}</td>
                  <td>
                    <CustomerStatusBadge status={c.status} />
                  </td>
                  <td>{c.negotiationStyle ? NEGOTIATION_LABEL[c.negotiationStyle] : '-'}</td>
                  <td>{c.owner?.fullName ?? '-'}</td>
                  <td className="mp-num">{c._count?.contacts ?? 0}</td>
                  <td className="mp-num">{c._count?.opportunities ?? 0}</td>
                  <td className="mp-num">{c._count?.orders ?? 0}</td>
                  <td>
                    <div className="mp-inline-actions">
                      <Button design="Transparent" icon="detail-view" onClick={() => setSelected(c.id)}>
                        Aç
                      </Button>
                      {can('MUSTERILER', 'edit') && (
                        <Button design="Transparent" icon="edit" onClick={() => setEditing(c)} />
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
        <CustomerDialog
          customer={editing}
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

// ---------------------------------------------------------------------------
// Müşteri 360° görünümü
// ---------------------------------------------------------------------------

function CustomerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [contactDialog, setContactDialog] = useState<Contact | null | undefined>(undefined);
  const [interactionOpen, setInteractionOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<Customer & Record<string, unknown>>(`/customers/${id}`),
  });

  const behavior = useQuery({
    queryKey: ['customer-behavior', id],
    queryFn: () => api.get<BehaviorRow>(`/customers/${id}/behavior`),
  });

  const recommendations = useQuery({
    queryKey: ['customer-recommendations', id],
    queryFn: () => api.get<Recommendation[]>(`/customers/${id}/recommendations`),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={4} rows={6} />
    );
  }

  const contacts = (data.contacts ?? []) as Contact[];
  const interactions = (data as unknown as { interactions: import('../api/types.js').Interaction[] }).interactions ?? [];
  const orders = (data as unknown as { orders: import('../api/types.js').Order[] }).orders ?? [];
  const quotes = (data as unknown as { quotes: import('../api/types.js').Quote[] }).quotes ?? [];
  const opportunities = (data as unknown as { opportunities: import('../api/types.js').Opportunity[] }).opportunities ?? [];
  const contracts = (data as unknown as { contracts: import('../api/types.js').Contract[] }).contracts ?? [];
  const tickets = (data as unknown as { tickets: import('../api/types.js').ServiceTicket[] }).tickets ?? [];
  const tasks = (data as unknown as { tasks: import('../api/types.js').Task[] }).tasks ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['customer', id] });

  return (
    <div className="mp-page">
      <PageHeader
        title={data.name}
        subtitle={`${data.code}${data.industry ? ` · ${data.industry}` : ''}${data.city ? ` · ${data.city}` : ''}`}
        actions={
          <Button design="Transparent" icon="nav-back" onClick={onBack}>
            Listeye dön
          </Button>
        }
      />

      <div className="mp-kpis">
        <KpiTile
          label="Davranış Segmenti"
          value={<span style={{ fontSize: '1.125rem' }}>{behavior.data?.segment ?? '-'}</span>}
          tone={
            behavior.data?.churnRisk === 'yuksek'
              ? 'critical'
              : behavior.data?.churnRisk === 'orta'
                ? 'warning'
                : 'good'
          }
          hint={behavior.data ? `RFM ${behavior.data.rfm}` : undefined}
        />
        <KpiTile
          label="Satın Alma Olasılığı"
          value={`%${behavior.data?.purchaseProbability ?? 0}`}
          tone="info"
        />
        <KpiTile
          label="Toplam Ciro"
          value={formatMoney(behavior.data?.monetary ?? 0, data.currency)}
          tone="good"
          hint={`${behavior.data?.frequency ?? 0} sipariş`}
        />
        <KpiTile
          label="Son Sipariş"
          value={
            behavior.data?.recencyDays === null || behavior.data?.recencyDays === undefined
              ? 'Hiç'
              : `${behavior.data.recencyDays} gün önce`
          }
          tone={
            behavior.data?.recencyDays !== null && (behavior.data?.recencyDays ?? 0) > 365
              ? 'critical'
              : 'info'
          }
        />
      </div>

      {behavior.data && <div className="mp-note">{behavior.data.explanation}</div>}

      <TabContainer contentBackgroundDesign="Transparent">
        <Tab text="Genel" selected>
          <div className="mp-split">
            <div>
              <Section title="Firma bilgileri">
                <FieldGrid>
                  <Field label="Unvan" value={data.name} />
                  <Field label="Kısa ad" value={data.shortName} />
                  <Field label="Sektör" value={data.industry} />
                  <Field label="Durum" value={<CustomerStatusBadge status={data.status} />} />
                  <Field label="Telefon" value={data.phone} />
                  <Field label="E-posta" value={data.email} />
                  <Field label="Web" value={data.website} />
                  <Field label="Şehir / Ülke" value={[data.city, data.country].filter(Boolean).join(' / ')} />
                  <Field label="Adres" value={data.address} />
                  <Field label="Vergi no / dairesi" value={[data.taxNumber, data.taxOffice].filter(Boolean).join(' / ')} />
                  <Field label="Ödeme koşulu" value={data.paymentTerms} />
                  <Field label="Teslim koşulu" value={data.deliveryTerms} />
                  <Field label="Standart iskonto" value={formatPct(data.standardDiscountPct)} />
                  <Field label="Kredi limiti" value={data.creditLimit ? formatMoney(data.creditLimit, data.currency) : '-'} />
                  <Field label="Satış temsilcisi" value={data.owner?.fullName} />
                  <Field label="Bilinen rakipler" value={data.competitors} />
                </FieldGrid>
              </Section>

              <Section title="Notlar ve davranış profili">
                <FieldGrid>
                  <Field
                    label="Pazarlık tarzı"
                    value={data.negotiationStyle ? NEGOTIATION_LABEL[data.negotiationStyle] : '-'}
                  />
                  <Field
                    label="Fiyat hassasiyeti"
                    value={data.priceSensitivity ? PRICE_SENSITIVITY_LABEL[data.priceSensitivity] : '-'}
                  />
                </FieldGrid>
                {data.negotiationStyle && (
                  <div className="mp-note" style={{ marginTop: '0.75rem' }}>
                    <strong>Taktik notu:</strong> {NEGOTIATION_HINT[data.negotiationStyle]}
                  </div>
                )}
                {data.behaviorNotes && (
                  <>
                    <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>
                      Pazarlık geçmişi ve davranış gözlemleri
                    </div>
                    <div className="mp-field__value" style={{ whiteSpace: 'pre-wrap' }}>
                      {data.behaviorNotes}
                    </div>
                  </>
                )}
                {data.notes && (
                  <>
                    <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>
                      Firma notları
                    </div>
                    <div className="mp-field__value" style={{ whiteSpace: 'pre-wrap' }}>
                      {data.notes}
                    </div>
                  </>
                )}
              </Section>
            </div>

            <div>
              <Section title="Önerilen ürünler">
                <div className="mp-note">
                  Müşterinin almadığı ürünler arasından kategori, sektör ve genel satış sinyalleriyle
                  puanlanır.
                </div>
                {!recommendations.data?.length ? (
                  <EmptyRow text="Öneri üretilemedi (sipariş geçmişi yetersiz)." />
                ) : (
                  recommendations.data.map((r) => (
                    <div key={r.productId} className="mp-opp-card">
                      <div className="mp-opp-card__title">
                        {r.name} <span className="mp-option__delta">({r.code})</span>
                      </div>
                      <div className="mp-opp-card__meta">Öneri gücü: {r.score}/100</div>
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem', fontSize: '0.75rem' }}>
                        {r.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </Section>

              <Section title="Açık görevler">
                {tasks.filter((t) => t.status === 'ACIK').length === 0 ? (
                  <EmptyRow text="Açık görev yok." />
                ) : (
                  tasks
                    .filter((t) => t.status === 'ACIK')
                    .map((t) => (
                      <div key={t.id} className="mp-opp-card">
                        <div className="mp-opp-card__title">{t.title}</div>
                        <div className="mp-opp-card__meta">
                          {formatDate(t.dueAt)} · {t.assignee?.fullName ?? '-'}
                        </div>
                      </div>
                    ))
                )}
              </Section>
            </div>
          </div>
        </Tab>

        <Tab text={`Kişiler (${contacts.length})`}>
          <Section
            title="Paydaş haritası"
            actions={
              can('MUSTERILER', 'create') && (
                <Button design="Emphasized" icon="add" onClick={() => setContactDialog(null)}>
                  Kişi ekle
                </Button>
              )
            }
          >
            <div className="mp-note">
              Kim karar verici, kim teknik onaycı, kim kapı bekçisi — satış stratejisi bu haritaya göre kurulur.
            </div>
            {contacts.length === 0 ? (
              <EmptyRow text="Kayıtlı kişi yok." />
            ) : (
              <>
                <ContactTree contacts={contacts} onEdit={(c) => setContactDialog(c)} canEdit={can('MUSTERILER', 'edit')} />
                <div className="mp-table-wrap" style={{ marginTop: '1rem' }}>
                  <table className="mp-table">
                    <thead>
                      <tr>
                        <th>Ad Soyad</th>
                        <th>Ünvan</th>
                        <th>Departman</th>
                        <th>Rol</th>
                        <th>Etki</th>
                        <th>Tutum</th>
                        <th>Pazarlık tarzı</th>
                        <th>E-posta</th>
                        <th>Telefon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.fullName}</strong>
                            {c.isPrimary && <span className="mp-optgroup__req"> · Birincil</span>}
                            {c.notes && <div className="mp-person__title">{c.notes}</div>}
                          </td>
                          <td>{c.title ?? '-'}</td>
                          <td>{DEPARTMENT_LABEL[c.department]}</td>
                          <td>{STAKEHOLDER_ROLE_LABEL[c.role]}</td>
                          <td>
                            <InfluenceMeter value={c.influence} />
                          </td>
                          <td>
                            <SentimentBadge sentiment={c.sentiment} />
                          </td>
                          <td>{c.negotiationStyle ? NEGOTIATION_LABEL[c.negotiationStyle] : '-'}</td>
                          <td>{c.email ?? '-'}</td>
                          <td>{c.phone ?? c.mobile ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        </Tab>

        <Tab text={`Geçmiş (${interactions.length})`}>
          <Section
            title="Etkileşim geçmişi"
            actions={
              can('MUSTERILER', 'create') && (
                <Button design="Emphasized" icon="add" onClick={() => setInteractionOpen(true)}>
                  Etkileşim ekle
                </Button>
              )
            }
          >
            {interactions.length === 0 ? (
              <EmptyRow text="Kayıt yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Tür</th>
                      <th>Konu</th>
                      <th>Kişi</th>
                      <th>Özet</th>
                      <th>Sonuç</th>
                      <th>Kaydeden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((i) => (
                      <tr key={i.id}>
                        <td>{formatDate(i.occurredAt)}</td>
                        <td>{INTERACTION_LABEL[i.type]}</td>
                        <td>
                          <strong>{i.subject}</strong>
                        </td>
                        <td>{i.contact?.fullName ?? '-'}</td>
                        <td>{i.summary ?? '-'}</td>
                        <td>{i.outcome ?? '-'}</td>
                        <td>{i.user?.fullName ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </Tab>

        <Tab text={`Fırsat & Teklif (${opportunities.length + quotes.length})`}>
          <Section title="Fırsatlar">
            {opportunities.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kod</th>
                      <th>Başlık</th>
                      <th>Aşama</th>
                      <th className="mp-num">Olasılık</th>
                      <th className="mp-num">Beklenen değer</th>
                      <th>Kapanış</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((o) => (
                      <tr key={o.id}>
                        <td>{o.code}</td>
                        <td>{o.title}</td>
                        <td>{o.stage}</td>
                        <td className="mp-num">%{o.probability}</td>
                        <td className="mp-num">{formatMoney(o.expectedValue, o.currency)}</td>
                        <td>{formatDate(o.expectedCloseDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Güncel teklifler">
            {quotes.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Teklif No</th>
                      <th>Başlık</th>
                      <th>Durum</th>
                      <th className="mp-num">Tutar</th>
                      <th>Geçerlilik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id}>
                        <td>
                          {q.quoteNo} · {revisionLabel(q.revision)}
                        </td>
                        <td>{q.title}</td>
                        <td>{q.status}</td>
                        <td className="mp-num">{formatMoney(q.totalPrice, q.currency)}</td>
                        <td>{formatDate(q.validUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </Tab>

        <Tab text={`Sipariş & Servis (${orders.length + tickets.length})`}>
          <Section title="Siparişler">
            {orders.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Sipariş No</th>
                      <th>Durum</th>
                      <th>Tarih</th>
                      <th>Termin</th>
                      <th className="mp-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderNo}</td>
                        <td>{o.status}</td>
                        <td>{formatDate(o.orderDate)}</td>
                        <td>{formatDate(o.promisedDate)}</td>
                        <td className="mp-num">{formatMoney(o.totalAmount, o.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Servis kayıtları">
            {tickets.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kayıt No</th>
                      <th>Tür</th>
                      <th>Konu</th>
                      <th>Durum</th>
                      <th>Açılış</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id}>
                        <td>{t.ticketNo}</td>
                        <td>{t.type}</td>
                        <td>{t.subject}</td>
                        <td>{t.status}</td>
                        <td>{formatDate(t.openedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Sözleşmeler">
            {contracts.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Sözleşme No</th>
                      <th>Tür</th>
                      <th>Başlık</th>
                      <th>Durum</th>
                      <th>Bitiş</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c.id}>
                        <td>{c.contractNo}</td>
                        <td>{c.type}</td>
                        <td>{c.title}</td>
                        <td>{c.status}</td>
                        <td>{formatDate(c.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </Tab>
      </TabContainer>

      {contactDialog !== undefined && (
        <ContactDialog
          customerId={id}
          contact={contactDialog}
          contacts={contacts}
          onClose={() => setContactDialog(undefined)}
          onSaved={() => {
            setContactDialog(undefined);
            refresh();
          }}
        />
      )}

      {interactionOpen && (
        <InteractionDialog
          customerId={id}
          contacts={contacts}
          onClose={() => setInteractionOpen(false)}
          onSaved={() => {
            setInteractionOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Kişileri "kime bağlı" ilişkisine göre ağaç olarak gösterir. */
function ContactTree({
  contacts,
  onEdit,
  canEdit,
}: {
  contacts: Contact[];
  onEdit: (c: Contact) => void;
  canEdit: boolean;
}) {
  const byParent = useMemo(() => {
    const known = new Set(contacts.map((c) => c.id));
    const map = new Map<string | null, Contact[]>();
    for (const c of contacts) {
      // Bağlı olduğu kişi listede yoksa (silinmiş/filtrelenmiş) kişi kaybolmasın,
      // kök seviyede gösterilsin.
      const parent = c.reportsToId && known.has(c.reportsToId) ? c.reportsToId : null;
      map.set(parent, [...(map.get(parent) ?? []), c]);
    }
    return map;
  }, [contacts]);

  /**
   * `seen`, hiyerarşideki döngülere karşı korumadır.
   *
   * Sunucu yalnızca kişinin kendisine bağlanmasını engelliyor; A→B→A gibi bir
   * halka kaydedilebiliyor ve o hâlde bu özyineleme yığını taşırıp sekmeyi
   * dondurur. Daha önce çizilmiş bir kişiye ikinci kez inilmez.
   */
  function render(parentId: string | null, seen: ReadonlySet<string> = new Set()): React.ReactNode {
    const children = byParent.get(parentId)?.filter((c) => !seen.has(c.id));
    if (!children?.length) return null;
    const nextSeen = new Set(seen);
    children.forEach((c) => nextSeen.add(c.id));
    return (
      <ul className="mp-tree">
        {children.map((c) => (
          <li key={c.id}>
            <div className="mp-person">
              <span className="mp-person__name">{c.fullName}</span>
              <span className="mp-person__title">
                {c.title ?? ''} · {DEPARTMENT_LABEL[c.department]}
              </span>
              <span className="mp-person__title">{STAKEHOLDER_ROLE_LABEL[c.role]}</span>
              <InfluenceMeter value={c.influence} />
              <SentimentBadge sentiment={c.sentiment} />
              {canEdit && <Button design="Transparent" icon="edit" onClick={() => onEdit(c)} />}
            </div>
            {render(c.id, nextSeen)}
          </li>
        ))}
      </ul>
    );
  }

  return <>{render(null)}</>;
}

// ---------------------------------------------------------------------------
// Diyaloglar
// ---------------------------------------------------------------------------

function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    shortName: customer?.shortName ?? '',
    industry: customer?.industry ?? '',
    status: (customer?.status ?? 'POTANSIYEL') as CustomerStatus,
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    website: customer?.website ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? '',
    taxNumber: customer?.taxNumber ?? '',
    taxOffice: customer?.taxOffice ?? '',
    paymentTerms: customer?.paymentTerms ?? '',
    deliveryTerms: customer?.deliveryTerms ?? '',
    standardDiscountPct: customer?.standardDiscountPct ?? 0,
    negotiationStyle: (customer?.negotiationStyle ?? '') as NegotiationStyle | '',
    priceSensitivity: (customer?.priceSensitivity ?? '') as PriceSensitivity | '',
    competitors: customer?.competitors ?? '',
    notes: customer?.notes ?? '',
    behaviorNotes: customer?.behaviorNotes ?? '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        standardDiscountPct: Number(form.standardDiscountPct) || 0,
        negotiationStyle: form.negotiationStyle || null,
        priceSensitivity: form.priceSensitivity || null,
      };
      return customer
        ? api.put(`/customers/${customer.id}`, payload)
        : api.post('/customers', payload);
    },
    onSuccess: () => {
      toast(customer ? 'Müşteri güncellendi.' : 'Müşteri oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText={customer ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}
      onClose={onClose}
      style={{ width: '860px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={form.name.length < 2}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div className="mp-form__full">
          <Label required showColon>Firma unvanı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label showColon>Kısa ad</Label>
          <Input style={{ width: '100%' }} value={form.shortName} onInput={(e) => set('shortName', e.target.value)} />
        </div>
        <div>
          <Label showColon>Sektör</Label>
          <Input style={{ width: '100%' }} value={form.industry} onInput={(e) => set('industry', e.target.value)} />
        </div>
        <div>
          <Label showColon>Durum</Label>
          <Select
            style={{ width: '100%' }}
            onChange={(e) => set('status', e.detail.selectedOption.dataset.value)}
          >
            {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
              <Option key={s} data-value={s} selected={form.status === s}>
                {CUSTOMER_STATUS_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Telefon</Label>
          <Input style={{ width: '100%' }} value={form.phone} onInput={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <Label showColon>E-posta</Label>
          <Input style={{ width: '100%' }} value={form.email} onInput={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <Label showColon>Web sitesi</Label>
          <Input style={{ width: '100%' }} value={form.website} onInput={(e) => set('website', e.target.value)} />
        </div>
        <div>
          <Label showColon>Şehir</Label>
          <Input style={{ width: '100%' }} value={form.city} onInput={(e) => set('city', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Adres</Label>
          <Input style={{ width: '100%' }} value={form.address} onInput={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <Label showColon>Vergi no</Label>
          <Input style={{ width: '100%' }} value={form.taxNumber} onInput={(e) => set('taxNumber', e.target.value)} />
        </div>
        <div>
          <Label showColon>Vergi dairesi</Label>
          <Input style={{ width: '100%' }} value={form.taxOffice} onInput={(e) => set('taxOffice', e.target.value)} />
        </div>
        <div>
          <Label showColon>Ödeme koşulu</Label>
          <Input style={{ width: '100%' }} value={form.paymentTerms} onInput={(e) => set('paymentTerms', e.target.value)} />
        </div>
        <div>
          <Label showColon>Teslim koşulu</Label>
          <Input style={{ width: '100%' }} value={form.deliveryTerms} onInput={(e) => set('deliveryTerms', e.target.value)} />
        </div>
        <div>
          <Label showColon>Standart iskonto (%)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.standardDiscountPct)}
            onInput={(e) => set('standardDiscountPct', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Pazarlık tarzı</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('negotiationStyle', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.negotiationStyle}>
              (belirtilmemiş)
            </Option>
            {(Object.keys(NEGOTIATION_LABEL) as NegotiationStyle[]).map((s) => (
              <Option key={s} data-value={s} selected={form.negotiationStyle === s}>
                {NEGOTIATION_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Fiyat hassasiyeti</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('priceSensitivity', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.priceSensitivity}>
              (belirtilmemiş)
            </Option>
            {(Object.keys(PRICE_SENSITIVITY_LABEL) as PriceSensitivity[]).map((s) => (
              <Option key={s} data-value={s} selected={form.priceSensitivity === s}>
                {PRICE_SENSITIVITY_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label showColon>Bilinen rakipler</Label>
          <Input style={{ width: '100%' }} value={form.competitors} onInput={(e) => set('competitors', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Pazarlık geçmişi ve davranış gözlemleri</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            value={form.behaviorNotes}
            onInput={(e) => set('behaviorNotes', e.target.value)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Firma notları</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            value={form.notes}
            onInput={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function ContactDialog({
  customerId,
  contact,
  contacts,
  onClose,
  onSaved,
}: {
  customerId: string;
  contact: Contact | null;
  contacts: Contact[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    fullName: contact?.fullName ?? '',
    title: contact?.title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    mobile: contact?.mobile ?? '',
    department: (contact?.department ?? 'DIGER') as StakeholderDepartment,
    role: (contact?.role ?? 'ETKILEYICI') as StakeholderRole,
    influence: contact?.influence ?? 3,
    sentiment: (contact?.sentiment ?? 'NOTR') as Sentiment,
    negotiationStyle: (contact?.negotiationStyle ?? '') as NegotiationStyle | '',
    priceSensitivity: (contact?.priceSensitivity ?? '') as PriceSensitivity | '',
    responsiveness: contact?.responsiveness ?? '',
    notes: contact?.notes ?? '',
    reportsToId: contact?.reportsToId ?? '',
    isPrimary: contact?.isPrimary ?? false,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        influence: Number(form.influence) || 3,
        negotiationStyle: form.negotiationStyle || null,
        priceSensitivity: form.priceSensitivity || null,
        reportsToId: form.reportsToId || null,
      };
      return contact
        ? api.put(`/customers/contacts/${contact.id}`, payload)
        : api.post(`/customers/${customerId}/contacts`, payload);
    },
    onSuccess: () => {
      toast(contact ? 'Kişi güncellendi.' : 'Kişi eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText={contact ? 'Kişiyi Düzenle' : 'Yeni Kişi'}
      onClose={onClose}
      style={{ width: '760px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={form.fullName.length < 2}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Ad Soyad</Label>
          <Input style={{ width: '100%' }} value={form.fullName} onInput={(e) => set('fullName', e.target.value)} />
        </div>
        <div>
          <Label showColon>Ünvan</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>E-posta</Label>
          <Input style={{ width: '100%' }} value={form.email} onInput={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <Label showColon>Telefon</Label>
          <Input style={{ width: '100%' }} value={form.phone} onInput={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <Label showColon>Cep telefonu</Label>
          <Input style={{ width: '100%' }} value={form.mobile} onInput={(e) => set('mobile', e.target.value)} />
        </div>
        <div>
          <Label showColon>Departman</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('department', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(DEPARTMENT_LABEL) as StakeholderDepartment[]).map((d) => (
              <Option key={d} data-value={d} selected={form.department === d}>
                {DEPARTMENT_LABEL[d]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Satın alma rolü</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('role', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(STAKEHOLDER_ROLE_LABEL) as StakeholderRole[]).map((r) => (
              <Option key={r} data-value={r} selected={form.role === r}>
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
            value={String(form.influence)}
            onInput={(e) => set('influence', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Marpol'e tutumu</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('sentiment', e.detail.selectedOption.dataset.value)}>
            <Option data-value="DESTEKLIYOR" selected={form.sentiment === 'DESTEKLIYOR'}>Destekliyor</Option>
            <Option data-value="NOTR" selected={form.sentiment === 'NOTR'}>Nötr</Option>
            <Option data-value="KARSIT" selected={form.sentiment === 'KARSIT'}>Karşıt</Option>
          </Select>
        </div>
        <div>
          <Label showColon>Pazarlık tarzı</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('negotiationStyle', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.negotiationStyle}>(belirtilmemiş)</Option>
            {(Object.keys(NEGOTIATION_LABEL) as NegotiationStyle[]).map((s) => (
              <Option key={s} data-value={s} selected={form.negotiationStyle === s}>
                {NEGOTIATION_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Fiyat hassasiyeti</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('priceSensitivity', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.priceSensitivity}>(belirtilmemiş)</Option>
            {(Object.keys(PRICE_SENSITIVITY_LABEL) as PriceSensitivity[]).map((s) => (
              <Option key={s} data-value={s} selected={form.priceSensitivity === s}>
                {PRICE_SENSITIVITY_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Kime bağlı</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('reportsToId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.reportsToId}>(bağlı değil)</Option>
            {contacts
              .filter((c) => c.id !== contact?.id)
              .map((c) => (
                <Option key={c.id} data-value={c.id} selected={form.reportsToId === c.id}>
                  {c.fullName}
                </Option>
              ))}
          </Select>
        </div>
        <div>
          <Label showColon>Ulaşılabilirlik</Label>
          <Input
            style={{ width: '100%' }}
            value={form.responsiveness}
            onInput={(e) => set('responsiveness', e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <CheckBox
            text="Birincil kişi"
            checked={form.isPrimary}
            onChange={(e) => set('isPrimary', e.target.checked)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Kişi hakkında notlar (yaklaşımı, hassasiyetleri, geçmişi)</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            value={form.notes}
            onInput={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function InteractionDialog({
  customerId,
  contacts,
  onClose,
  onSaved,
}: {
  customerId: string;
  contacts: Contact[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    type: 'TELEFON' as InteractionType,
    subject: '',
    summary: '',
    outcome: '',
    sentiment: 'NOTR' as Sentiment,
    occurredAt: today(),
    contactId: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api.post(`/customers/${customerId}/interactions`, {
        ...form,
        contactId: form.contactId || null,
      }),
    onSuccess: () => {
      toast('Etkileşim kaydedildi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Etkileşim"
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={form.subject.length < 2}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label showColon>Tür</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('type', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(INTERACTION_LABEL) as InteractionType[]).map((t) => (
              <Option key={t} data-value={t} selected={form.type === t}>
                {INTERACTION_LABEL[t]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Tarih</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.occurredAt}
            onChange={(v) => set('occurredAt', v)}
          />
        </div>
        <div>
          <Label showColon>Görüşülen kişi</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('contactId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.contactId}>(belirtilmemiş)</Option>
            {contacts.map((c) => (
              <Option key={c.id} data-value={c.id} selected={form.contactId === c.id}>
                {c.fullName}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Tutum</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('sentiment', e.detail.selectedOption.dataset.value)}>
            <Option data-value="DESTEKLIYOR" selected={form.sentiment === 'DESTEKLIYOR'}>Olumlu</Option>
            <Option data-value="NOTR" selected={form.sentiment === 'NOTR'}>Nötr</Option>
            <Option data-value="KARSIT" selected={form.sentiment === 'KARSIT'}>Olumsuz</Option>
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Konu</Label>
          <Input style={{ width: '100%' }} value={form.subject} onInput={(e) => set('subject', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Özet</Label>
          <TextArea style={{ width: '100%' }} rows={3} value={form.summary} onInput={(e) => set('summary', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Sonuç / alınan aksiyon</Label>
          <Input style={{ width: '100%' }} value={form.outcome} onInput={(e) => set('outcome', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
