/** Sunucudaki Prisma enum'larının istemci karşılıkları. */

export type ModuleKey =
  | 'GOSTERGE_PANELI'
  | 'MUSTERILER'
  | 'FIRSATLAR'
  | 'TEKLIFLER'
  | 'URUN_KATALOGU'
  | 'FIYATLANDIRMA'
  | 'SIPARISLER'
  | 'DOKUMANLAR'
  | 'SOZLESMELER'
  | 'SAHA_SERVIS'
  | 'RAPORLAR'
  | 'YETKILENDIRME';

export interface PermissionRow {
  module: ModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  employeeNo: string | null;
  department: string | null;
  title: string | null;
  isAdmin: boolean;
  maxDiscountPct: number;
  permissions: PermissionRow[];
}

export interface AppUser extends SessionUser {
  email: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type CustomerStatus = 'POTANSIYEL' | 'AKTIF' | 'PASIF' | 'KARA_LISTE';

export type NegotiationStyle =
  | 'ISBIRLIKCI'
  | 'REKABETCI'
  | 'FIYAT_ODAKLI'
  | 'ILISKI_ODAKLI'
  | 'ANALITIK'
  | 'KACINGAN';

export type PriceSensitivity = 'DUSUK' | 'ORTA' | 'YUKSEK';

export type StakeholderDepartment =
  | 'SATIN_ALMA'
  | 'MUHENDISLIK'
  | 'URETIM'
  | 'KALITE'
  | 'FINANS'
  | 'UST_YONETIM'
  | 'BAKIM'
  | 'DIGER';

export type StakeholderRole =
  | 'KARAR_VERICI'
  | 'TEKNIK_ONAYCI'
  | 'EKONOMIK_ONAYCI'
  | 'KULLANICI'
  | 'KAPI_BEKCISI'
  | 'ETKILEYICI';

export type Sentiment = 'DESTEKLIYOR' | 'NOTR' | 'KARSIT';

export type InteractionType =
  | 'TELEFON'
  | 'EPOSTA'
  | 'ZIYARET'
  | 'TOPLANTI'
  | 'FUAR'
  | 'DEMO'
  | 'TEKLIF_SUNUMU'
  | 'SERVIS'
  | 'DIGER';

export type TaskStatus = 'ACIK' | 'TAMAMLANDI' | 'IPTAL';

export type OpportunityStage =
  | 'KESIF'
  | 'NITELENDIRME'
  | 'TEKNIK_DEGERLENDIRME'
  | 'TEKLIF'
  | 'PAZARLIK'
  | 'KAZANILDI'
  | 'KAYBEDILDI';

export type QuoteStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'GONDERILDI'
  | 'PAZARLIK'
  | 'KABUL_EDILDI'
  | 'REDDEDILDI'
  | 'SURESI_DOLDU'
  | 'REVIZE_EDILDI';

export type OrderStatus =
  | 'ONAY_BEKLIYOR'
  | 'ONAYLANDI'
  | 'URETIMDE'
  | 'KISMI_SEVK'
  | 'SEVK_EDILDI'
  | 'TESLIM_EDILDI'
  | 'FATURALANDI'
  | 'IPTAL';

export type RuleType = 'GEREKTIRIR' | 'ENGELLER' | 'UYARIR';
export type RuleSeverity = 'ENGELLE' | 'UYAR';
export type RateKind = 'ISCILIK' | 'MUHENDISLIK' | 'SAHA_SERVIS';

export type ComplianceStatus =
  | 'KARSILANIYOR'
  | 'KISMEN_KARSILANIYOR'
  | 'KARSILANMIYOR'
  | 'DEGERLENDIRILIYOR'
  | 'KAPSAM_DISI';

export type Criticality = 'DUSUK' | 'ORTA' | 'YUKSEK' | 'KRITIK';

export type ContractType = 'NDA' | 'CERCEVE' | 'SATIS' | 'GARANTI' | 'BAKIM' | 'TESLIMAT' | 'DIGER';
export type ContractStatus =
  | 'TASLAK'
  | 'INCELEMEDE'
  | 'IMZA_BEKLIYOR'
  | 'YURURLUKTE'
  | 'SONA_ERDI'
  | 'FESHEDILDI';

export type DocumentType =
  | 'TEKNIK_SARTNAME'
  | 'CIZIM'
  | 'SERTIFIKA'
  | 'TEST_RAPORU'
  | 'SUNUM'
  | 'YAZISMA'
  | 'DIGER';

export type AssetStatus = 'DEVREYE_ALINDI' | 'CALISIYOR' | 'ARIZALI' | 'BAKIMDA' | 'HIZMET_DISI';
export type TicketType =
  | 'ARIZA'
  | 'PERIYODIK_BAKIM'
  | 'DEVREYE_ALMA'
  | 'EGITIM'
  | 'YEDEK_PARCA'
  | 'SIKAYET'
  | 'DIGER';
export type TicketStatus = 'ACIK' | 'ATANDI' | 'SAHADA' | 'BEKLEMEDE' | 'COZULDU' | 'KAPANDI';
export type HandoverStatus = 'BEKLIYOR' | 'GONDERILDI' | 'KABUL_EDILDI' | 'REVIZE_ISTENDI';

// ---------------------------------------------------------------------------
// Varlıklar
// ---------------------------------------------------------------------------

export interface Ref {
  id: string;
  code?: string;
  name?: string;
  fullName?: string;
  title?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  industry: string | null;
  status: CustomerStatus;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  currency: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  creditLimit: number | null;
  standardDiscountPct: number;
  negotiationStyle: NegotiationStyle | null;
  priceSensitivity: PriceSensitivity | null;
  notes: string | null;
  behaviorNotes: string | null;
  competitors: string | null;
  ownerId: string | null;
  owner?: Ref | null;
  isActive: boolean;
  createdAt: string;
  contacts?: Contact[];
  _count?: { contacts: number; opportunities: number; orders: number; quotes: number };
}

export interface Contact {
  id: string;
  customerId: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  department: StakeholderDepartment;
  role: StakeholderRole;
  influence: number;
  sentiment: Sentiment;
  negotiationStyle: NegotiationStyle | null;
  priceSensitivity: PriceSensitivity | null;
  responsiveness: string | null;
  notes: string | null;
  reportsToId: string | null;
  reportsTo?: Ref | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface Interaction {
  id: string;
  customerId: string;
  type: InteractionType;
  subject: string;
  summary: string | null;
  outcome: string | null;
  sentiment: Sentiment;
  occurredAt: string;
  followUpAt: string | null;
  customer?: Ref | null;
  contact?: Ref | null;
  user?: Ref | null;
  opportunity?: Ref | null;
}

export interface Task {
  id: string;
  customerId: string | null;
  title: string;
  description: string | null;
  dueAt: string;
  status: TaskStatus;
  completedAt: string | null;
  customer?: Ref | null;
  assignee?: Ref | null;
  opportunity?: Ref | null;
}

export interface Opportunity {
  id: string;
  code: string;
  customerId: string;
  title: string;
  description: string | null;
  stage: OpportunityStage;
  probability: number;
  expectedValue: number;
  currency: string;
  expectedCloseDate: string | null;
  openedAt: string;
  closedAt: string | null;
  source: string | null;
  competitor: string | null;
  lossReason: string | null;
  notes: string | null;
  customer?: Ref;
  owner?: Ref | null;
  stakeholders?: OpportunityStakeholder[];
  stageHistory?: { id: string; fromStage: OpportunityStage | null; toStage: OpportunityStage; note: string | null; changedAt: string }[];
  quotes?: Quote[];
  interactions?: Interaction[];
  tasks?: Task[];
  _count?: { quotes: number; stakeholders: number };
}

export interface OpportunityStakeholder {
  id: string;
  contactId: string;
  role: StakeholderRole;
  influence: number;
  sentiment: Sentiment;
  notes: string | null;
  contact: Contact;
}

export interface ProductOption {
  id: string;
  groupId: string;
  code: string;
  name: string;
  description: string | null;
  costDelta: number;
  priceDelta: number;
  leadTimeDelta: number;
  laborHours: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface OptionGroup {
  id: string;
  productId: string;
  code: string;
  name: string;
  isRequired: boolean;
  isMultiple: boolean;
  sortOrder: number;
  helpText: string | null;
  options: ProductOption[];
}

export interface ConfigRule {
  id: string;
  productId: string;
  code: string;
  name: string;
  type: RuleType;
  severity: RuleSeverity;
  whenOptions: string[];
  thenOptions: string[];
  message: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  family: string | null;
  description: string | null;
  unit: string;
  isConfigurable: boolean;
  listPrice: number | null;
  baseCost: number;
  leadTimeDays: number;
  notes: string | null;
  isActive: boolean;
  optionGroups?: OptionGroup[];
  rules?: ConfigRule[];
  bomLines?: BomLine[];
  laborLines?: LaborLine[];
  _count?: { optionGroups: number; rules: number };
}

export interface BomLine {
  id: string;
  materialId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  scrapPct: number;
  lineCost: number;
  revision: string;
  /**
   * Bağlı hammadde.
   *
   * Ürün kataloğu ucu malzemenin tamamını döner (güncel fiyat dahil); teklif
   * ucu ise yalnızca kimlik alanlarını seçer, çünkü teklifteki maliyet o anda
   * dondurulmuştur. Bu yüzden fiyat alanları isteğe bağlıdır — yoksa satırın
   * kendi `unitCost` değeri kullanılır.
   */
  material?: (Ref & { currentPrice?: number; scrapPct?: number }) | null;
}

export interface LaborLine {
  id: string;
  rateId: string;
  description: string | null;
  hours: number;
  hourlyRate: number;
  lineCost: number;
  rate?: LaborRate;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  currentPrice: number;
  currency: string;
  priceUpdatedAt: string;
  scrapPct: number;
  supplier: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface LaborRate {
  id: string;
  code: string;
  name: string;
  kind: RateKind;
  hourlyRate: number;
  currency: string;
  notes: string | null;
  isActive: boolean;
}

export interface PricingPolicy {
  id: string;
  code: string;
  name: string;
  overheadPct: number;
  engineeringPct: number;
  contingencyPct: number;
  targetMarginPct: number;
  minMarginPct: number;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
}

export interface ConfigViolation {
  ruleCode: string;
  ruleName: string;
  severity: RuleSeverity;
  message: string;
}

export interface CostBreakdown {
  baseCost: number;
  materialCost: number;
  laborCost: number;
  engineeringCost: number;
  optionCost: number;
  directCost: number;
  overhead: number;
  engineeringLoad: number;
  contingency: number;
  unitCost: number;
  suggestedUnitPrice: number;
  optionPrice: number;
  leadTimeDays: number;
}

export interface ConfigureResult {
  validation: { valid: boolean; blocking: ConfigViolation[]; warnings: ConfigViolation[] };
  cost: CostBreakdown;
  quantity: number;
  policy: { id: string; code: string; name: string; minMarginPct: number };
  lineCost: number;
  linePrice: number;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
  lineCost: number;
  marginPct: number;
  leadTimeDays: number;
  configSnapshot: unknown;
  notes: string | null;
  product?: Ref | null;
  options?: { id: string; option: Ref & { code: string; name: string } }[];
  bomLines?: BomLine[];
  laborLines?: LaborLine[];
}

export interface Quote {
  id: string;
  quoteNo: string;
  revision: number;
  revisionLabel?: string;
  rootQuoteId: string | null;
  isCurrent: boolean;
  revisionNote: string | null;
  customerId: string;
  opportunityId: string | null;
  policyId: string | null;
  title: string;
  status: QuoteStatus;
  currency: string;
  issuedAt: string;
  validUntil: string | null;
  sentAt: string | null;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  totalCost: number;
  totalPrice: number;
  marginPct: number;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  terms: string | null;
  notes: string | null;
  approvalNote: string | null;
  approvedAt: string | null;
  customer?: Ref;
  opportunity?: Ref | null;
  policy?: PricingPolicy | null;
  createdBy?: Ref | null;
  approvedBy?: Ref | null;
  items?: QuoteItem[];
  chain?: (Quote & { revisionLabel: string })[];
  _count?: { items: number };
}

export interface ErpLink {
  id: string;
  orderItemId: string;
  erpOrderNo: string | null;
  erpStatus: string | null;
  currentStep: string | null;
  progressPct: number;
  producedQty: number;
  erpDeadline: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  producedQty: number;
  shippedQty: number;
  product?: Ref | null;
  erpLink?: ErpLink | null;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  quoteId: string | null;
  status: OrderStatus;
  orderDate: string;
  promisedDate: string | null;
  deliveredAt: string | null;
  currency: string;
  totalAmount: number;
  customerPoNo: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  notes: string | null;
  customer?: Ref;
  quote?: Ref & { quoteNo: string; revision: number };
  createdBy?: Ref | null;
  items?: OrderItem[];
  history?: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; changedAt: string }[];
  handovers?: Handover[];
  _count?: { items: number };
}

export interface Handover {
  id: string;
  orderId: string;
  status: HandoverStatus;
  bomSnapshot: unknown;
  sentAt: string | null;
  erpReference: string | null;
  note: string | null;
  responseNote: string | null;
  createdAt: string;
  createdBy?: Ref | null;
}

export interface SpecRequirement {
  id: string;
  specDocumentId: string;
  clauseNo: string;
  text: string;
  category: string | null;
  criticality: Criticality;
  status: ComplianceStatus;
  response: string | null;
  deviation: string | null;
  ownerId: string | null;
  owner?: Ref | null;
  quoteItemId: string | null;
  sortOrder: number;
}

export interface ComplianceSummary {
  total: number;
  inScope: number;
  met: number;
  partial: number;
  notMet: number;
  open: number;
  criticalGaps: number;
  compliancePct: number;
}

export interface SpecDocument {
  id: string;
  customerId: string;
  title: string;
  docNo: string | null;
  revision: string;
  receivedAt: string;
  notes: string | null;
  customer?: Ref;
  opportunity?: Ref | null;
  requirements?: SpecRequirement[];
  summary?: ComplianceSummary;
}

export interface AppDocument {
  id: string;
  type: DocumentType;
  title: string;
  docNo: string | null;
  version: string;
  fileName: string | null;
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
  customer?: Ref | null;
  opportunity?: Ref | null;
}

export interface ContractVersion {
  id: string;
  contractId: string;
  version: number;
  changeNote: string | null;
  body: string | null;
  fileName: string | null;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: Ref | null;
}

export type ContractFileKind = 'IMZALI_KOPYA' | 'TASLAK' | 'EK' | 'DIGER';

/** Sözleşmeye yüklenen evrak (PDF / PNG / JPEG). */
export interface ContractFile {
  id: string;
  contractId: string;
  versionId: string | null;
  kind: ContractFileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
  uploadedBy?: Ref | null;
  version?: { id: string; version: number } | null;
}

export interface Contract {
  id: string;
  contractNo: string;
  customerId: string;
  type: ContractType;
  status: ContractStatus;
  title: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  value: number | null;
  currency: string;
  warrantyMonths: number | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  penaltyClause: string | null;
  governingLaw: string | null;
  notes: string | null;
  customer?: Ref;
  versions?: ContractVersion[];
  files?: ContractFile[];
  _count?: { versions: number; files: number };
}

export interface InstalledAsset {
  id: string;
  serialNo: string;
  customerId: string;
  name: string;
  location: string | null;
  installedAt: string | null;
  commissionedAt: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  status: AssetStatus;
  maintenanceIntervalMonths: number | null;
  lastServiceAt: string | null;
  nextServiceAt: string | null;
  notes: string | null;
  customer?: Ref;
  product?: Ref | null;
  _count?: { tickets: number };
}

export interface ServicePart {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  material?: Ref | null;
}

export interface ServiceVisit {
  id: string;
  ticketId: string;
  plannedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  workDone: string | null;
  travelKm: number;
  laborHours: number;
  totalCost: number;
  billable: boolean;
  customerSignedBy: string | null;
  notes: string | null;
  technician?: Ref | null;
  rate?: LaborRate | null;
  parts?: ServicePart[];
}

export interface ServiceTicket {
  id: string;
  ticketNo: string;
  customerId: string;
  assetId: string | null;
  type: TicketType;
  status: TicketStatus;
  priority: Criticality;
  subject: string;
  description: string | null;
  resolution: string | null;
  isWarranty: boolean;
  slaHours: number | null;
  openedAt: string;
  dueAt: string | null;
  closedAt: string | null;
  customer?: Ref;
  asset?: (Ref & { serialNo: string }) | null;
  contact?: Ref | null;
  assignee?: Ref | null;
  visits?: ServiceVisit[];
  _count?: { visits: number };
}

export interface BehaviorRow {
  customerId: string;
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  rfm: string;
  segment: string;
  purchaseProbability: number;
  churnRisk: 'dusuk' | 'orta' | 'yuksek';
  explanation: string;
  customer?: Ref & { industry: string | null; status: CustomerStatus };
}

export interface Recommendation {
  productId: string;
  code: string;
  name: string;
  family: string | null;
  score: number;
  reasons: string[];
}

export interface DashboardData {
  customerCount: number;
  openOpportunities: number;
  pipelineValue: number;
  weightedPipeline: number;
  openQuotes: number;
  pendingApproval: number;
  lifetimeValue: number;
  activeOrders: number;
  lateOrders: number;
  openTickets: number;
  overdueTickets: number;
  expiringContracts: number;
  overdueTasks: number;
  segmentDistribution: Record<string, number>;
  attentionNeeded: {
    id: string;
    code: string;
    name: string;
    industry: string | null;
    segment: string;
    recencyDays: number | null;
    purchaseProbability: number;
  }[];
  upcomingTasks: Task[];
  recentInteractions: Interaction[];
  recentOrders: Order[];
}

export interface TickerData {
  customers: number;
  opportunities: number;
  quotes: number;
  activeOrders: number;
  lateOrders: number;
  openTickets: number;
}

export interface ErpStatus {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  message: string;
}
