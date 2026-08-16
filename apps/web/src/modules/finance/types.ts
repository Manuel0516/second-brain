export type DecimalString = string

export type FinanceAccountType =
  | 'bank'
  | 'broker'
  | 'exchange'
  | 'wallet'
  | 'bot'
  | 'cash'

export type FinanceAssetType =
  | 'fiat'
  | 'fund'
  | 'etf'
  | 'stock'
  | 'gold'
  | 'crypto'
  | 'derivative'
  | 'other'

export type FinanceEventType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'trade'
  | 'staking_reward'
  | 'interest'
  | 'dividend'
  | 'funding_payment'
  | 'derivative_fill'
  | 'fee'
  | 'withholding'
  | 'corporate_action'
  | 'valuation_adjustment'
  | 'other'

export type ImportStatus =
  | 'previewed'
  | 'committed'
  | 'committed_with_rejections'
  | 'reprocessed'
  | 'failed'

export type EventRevisionStatus =
  | 'proposed'
  | 'confirmed'
  | 'superseded'
  | 'voided'

export type ReviewStatus = 'pending' | 'confirmed' | 'split' | 'deferred'
export type ReconciliationStatus =
  | 'pending'
  | 'reconciled'
  | 'warning'
  | 'blocked'
export type TaxTreatmentStatus =
  | 'candidate'
  | 'confirmed'
  | 'rejected'
  | 'superseded'
export type ReportStatus = 'ready' | 'ready_with_warnings' | 'blocked'
export type WarningSeverity = 'info' | 'warning' | 'blocking'

export interface PageMeta {
  limit: number
  offset: number
  total: number
  has_more: boolean
}

export interface FinanceWarning {
  code: string
  severity: WarningSeverity
  message: string
  entity_type: string | null
  entity_id: string | null
}

export interface Completeness {
  is_complete: boolean
  warnings: FinanceWarning[]
  blockers: FinanceWarning[]
}

export interface AuditMetadata {
  audit_entry_id: string
  action: string
  entity_type: string
  entity_id: string
  prior_revision_id: string | null
  new_revision_id: string | null
  created_at: string
}

export interface DownloadMetadata {
  file_id: string
  file_name: string
  media_type: string
  size: number
  sha256: string
  download_url: string
}

export interface EmptyState {
  code: string
  title: string
  message: string
  next_action: string | null
}

export interface PagedResponse<T> {
  items: T[]
  page: PageMeta
  completeness: Completeness
  empty_state: EmptyState | null
}

export type FinanceLoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty'; empty_state: EmptyState }
  | { status: 'error'; message: string; retryable: boolean }

export interface FinanceUploadError {
  code:
    | 'unsupported_type'
    | 'extension_mismatch'
    | 'file_too_large'
    | 'archive_too_large'
    | 'archive_too_many_entries'
    | 'archive_unsafe_path'
    | 'hash_mismatch'
    | 'malformed_file'
  message: string
  retryable: boolean
}

export interface EvidenceUploadProgress {
  status: 'queued' | 'uploading' | 'processing' | 'complete' | 'rejected'
  bytes_sent: number
  bytes_total: number
  evidence_document_id: string | null
  error: FinanceUploadError | null
}

export interface FinanceAccount {
  id: string
  name: string
  institution: string
  account_type: FinanceAccountType
  country_code: string
  base_currency: string
  tax_jurisdiction: string | null
  provider: string
  status: 'active' | 'closed'
  opened_at: string | null
  closed_at: string | null
  last_imported_at: string | null
  created_at: string
  updated_at: string
}

export interface FinanceAccountCreate {
  name: string
  institution: string
  account_type: FinanceAccountType
  country_code: string
  base_currency: string
  tax_jurisdiction: string | null
  provider: string
  external_reference: string | null
  opened_at: string | null
}

export interface FinanceSourceConnection {
  id: string
  account_id: string
  provider: string
  permission_scope: string[]
  status: 'disabled' | 'active' | 'error' | 'revoked'
  last_synced_at: string | null
  error_summary: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FinanceSourceConnectionCreate {
  account_id: string
  provider: string
  credential_reference: string | null
  permission_scope: string[]
}

export interface FinanceAsset {
  id: string
  asset_type: FinanceAssetType
  symbol: string | null
  name: string
  isin: string | null
  chain_id: string | null
  contract_address: string | null
  issuer_country: string | null
  decimals: number | null
  created_at: string
}

export interface FinanceAssetCreate {
  asset_type: FinanceAssetType
  symbol: string | null
  name: string
  isin: string | null
  chain_id: string | null
  contract_address: string | null
  issuer_country: string | null
  decimals: number | null
}

export interface FinanceEvidence {
  id: string
  file_id: string
  original_name: string
  media_type: string
  size: number
  sha256: string
  source_kind: string
  captured_at: string
  coverage_start: string | null
  coverage_end: string | null
  parser_id: string | null
  parser_version: string | null
  extraction_status: 'not_requested' | 'pending' | 'complete' | 'failed'
  retention_status: 'immutable'
  linked_event_revision_ids: string[]
  download_url: string
}

export interface FinanceEvidenceUploadRequest {
  file: File
  source_kind: string
  captured_at?: string | null
  coverage_start?: string | null
  coverage_end?: string | null
}

export interface ReportReadiness {
  status: ReportStatus
  blocking_count: number
  warning_count: number
  blockers: FinanceWarning[]
  warnings: FinanceWarning[]
}

export interface FinanceSummary {
  tax_year: number
  jurisdiction: string | null
  reporting_currency: string
  totals: {
    income: DecimalString
    expense: DecimalString
    rewards: DecimalString
    transfers: DecimalString
    net: DecimalString
    net_worth: DecimalString | null
  }
  counts: {
    accounts: number
    assets: number
    raw_records: number
    confirmed_events: number
    pending_review_groups: number
    blocking_reconciliations: number
    missing_evidence: number
  }
  readiness: ReportReadiness
  previous_year: {
    income: DecimalString
    expense: DecimalString
    rewards: DecimalString
    transfers: DecimalString
    net_worth: DecimalString
  }
  completeness: Completeness
  empty_state: EmptyState | null
}

export type FinanceActivityItem =
  | {
      representation: 'group'
      id: string
      review_status: ReviewStatus
      label: string
      event_type: FinanceEventType
      account_id: string
      asset_id: string
      tax_date: string
      first_effective_at: string
      last_effective_at: string
      member_count: number
      native_quantity: DecimalString
      report_value: DecimalString | null
      report_currency: string | null
      member_revision_ids: string[]
      completeness: Completeness
    }
  | {
      representation: 'raw'
      id: string
      event_id: string
      revision_number: number
      status: EventRevisionStatus
      event_type: FinanceEventType
      effective_at: string
      source_account_id: string
      native_quantity: DecimalString
      asset_id: string
      report_value: DecimalString | null
      report_currency: string | null
      raw_record_ids: string[]
      evidence_document_ids: string[]
      completeness: Completeness
    }

export interface EventLineage {
  event_id: string
  current_revision_id: string | null
  revisions: Array<{
    id: string
    revision_number: number
    status: EventRevisionStatus
    event_type: FinanceEventType
    effective_at: string
    supersedes_revision_id: string | null
    raw_record_ids: string[]
    evidence_document_ids: string[]
    component_ids: string[]
    posting_ids: string[]
    valuation_ids: string[]
    audit_entry_ids: string[]
  }>
}

export interface ImportMapping {
  date_column?: string
  time_column?: string
  amount_column?: string
  quantity_column?: string
  asset_column?: string
  description_column?: string
  external_id_column?: string
  event_type_column?: string
  timezone?: string
  date_format?: string
  decimal_separator?: '.' | ','
}

export interface ImportPreviewRequest {
  evidence_document_id: string
  account_id: string
  parser_id:
    | 'csv'
    | 'json'
    | 'pdf_statement'
    | 'pdf_metadata'
    | 'image_metadata'
    | 'archive_manifest'
  parser_version: string
  import_mode: 'normal' | 'reprocess'
  mapping: ImportMapping
}

export interface ImportPreview {
  import_id: string
  status: 'previewed'
  parser_id: string
  parser_version: string
  import_fingerprint: string
  coverage_start: string | null
  coverage_end: string | null
  columns: string[]
  sample_rows: Array<Record<string, string | null>>
  expected_record_count: number
  duplicate_file: boolean
  duplicate_record_count: number
  rejected_record_count: number
  rejected_rows: Array<{
    source_index: string
    code: string
    message: string
  }>
  mapping: ImportMapping
  warnings: FinanceWarning[]
  source_format?: 'csv' | 'pdf'
  unparsed_line_count?: number
  rows?: PdfStatementRow[]
}

/** One parsed line of a PDF statement preview — user-correctable before commit. */
export interface PdfStatementRow {
  source_index: string
  date: string | null
  description: string | null
  amount: DecimalString | null
  currency: string | null
  confidence: 'high' | 'medium' | 'low'
  source_line: string
}

export interface ImportRowOverride {
  source_index: string
  date?: string
  description?: string
  amount?: DecimalString
  currency?: string
}

export interface ImportCommitRequest {
  mapping: ImportMapping
  confirm_warnings: string[]
  row_overrides?: ImportRowOverride[]
  excluded_source_indexes?: string[]
}

export interface ImportCommitResult {
  import_id: string
  status: ImportStatus
  raw_record_count: number
  created_event_count: number
  duplicate_record_count: number
  rejected_record_count: number
  raw_record_ids: string[]
  event_revision_ids: string[]
  review_group_ids: string[]
  audit: AuditMetadata
}

export interface FinanceImportSummary {
  id: string
  account_id: string
  evidence_document_id: string
  parser_id: string
  parser_version: string
  import_mode: 'normal' | 'reprocess'
  import_fingerprint: string
  status: ImportStatus
  coverage_start: string | null
  coverage_end: string | null
  mapping: Record<string, unknown>
  error_summary: Record<string, unknown>
  created_at: string
  committed_at: string | null
}

export interface FinanceRawRecord {
  id: string
  import_id: string
  source_index: string
  provider_external_id: string | null
  record_fingerprint: string
  semantic_fingerprint: string | null
  original_payload: Record<string, unknown>
  extracted_payload: Record<string, unknown> | null
  source_timestamp: string | null
  source_timezone: string | null
  rejection_code: string | null
  rejection_reason: string | null
  created_at: string
}

export interface ReviewGroup {
  id: string
  status: ReviewStatus
  grouping_rule_version: string
  label: string
  account_id: string
  asset_id: string
  event_type: FinanceEventType
  tax_date: string
  first_effective_at: string
  last_effective_at: string
  member_revision_ids: string[]
  member_count: number
  native_quantity: DecimalString
  report_value: DecimalString | null
  report_currency: string | null
  materiality: DecimalString
  evidence_coverage: DecimalString
  confidence_explanation: string
  candidate_treatment: string | null
  completeness: Completeness
}

export interface ReviewConfirmationPreview {
  group_id: string
  member_count: number
  before_status: ReviewStatus
  after_status: 'confirmed'
  posting_count: number
  native_quantity: DecimalString
  report_value: DecimalString | null
  reusable_policy: {
    will_create: boolean
    matching_fields: string[]
    applies_to_future_only: true
  }
  invalidated_report_ids: string[]
  warnings: FinanceWarning[]
}

export interface ReviewConfirmRequest {
  expected_member_revision_ids: string[]
  create_reusable_policy: boolean
  reason: string
}

export interface ReviewConfirmResult {
  preview: ReviewConfirmationPreview
  confirmed_revision_ids: string[]
  policy_id: string | null
  audit: AuditMetadata
}

export interface ReviewSplitRequest {
  partitions: Array<{ label: string; member_revision_ids: string[] }>
  reason: string
}

export interface ReviewTotals {
  native_quantity: DecimalString
  report_value: DecimalString | null
}

export interface ReviewSplitResult {
  original_group_id: string
  replacement_groups: ReviewGroup[]
  before_totals: ReviewTotals
  after_totals: ReviewTotals
  audit: AuditMetadata
}

export interface ReviewDeferRequest {
  reason: string
  revisit_on: string | null
}

export interface ReviewDeferResult {
  group: ReviewGroup
  audit: AuditMetadata
}

export interface FinanceReconciliation {
  id: string
  account_id: string
  asset_id: string | null
  period_start: string
  period_end: string
  opening_balance: DecimalString
  movement_total: DecimalString
  closing_balance: DecimalString
  difference: DecimalString
  tolerance: DecimalString
  status: ReconciliationStatus
  source_revision_ids: string[]
  open_question_ids: string[]
  explanation: string | null
  run_at: string
}

export interface FinanceReconciliationRunRequest {
  account_id: string
  asset_id: string | null
  period_start: string
  period_end: string
  opening_balance: DecimalString
  closing_balance: DecimalString
  tolerance: DecimalString
  source_revision_ids: string[]
}

export interface FinanceReconciliationRunResult {
  reconciliation: FinanceReconciliation
  audit: AuditMetadata
}

export interface FinanceTaxProfile {
  id: string
  tax_year: number
  jurisdiction: 'SE' | 'ES'
  reporting_currency: string
  materiality_threshold: DecimalString
  reconciliation_tolerance: DecimalString
  status: 'draft' | 'active' | 'closed'
  created_at: string
  updated_at: string
}

export interface FinanceTaxProfileCreate {
  tax_year: number
  jurisdiction: 'SE' | 'ES'
  reporting_currency: string
  materiality_threshold: DecimalString
  reconciliation_tolerance: DecimalString
  status: 'draft' | 'active' | 'closed'
}

export interface FinanceResidencyFactCreate {
  fact_type: string
  period_start: string | null
  period_end: string | null
  value: Record<string, unknown>
  evidence_document_ids: string[]
  source: string
  notes: string | null
}

export interface FinanceResidencyFact {
  id: string
  tax_profile_id: string
  fact_type: string
  period_start: string | null
  period_end: string | null
  value: Record<string, unknown>
  evidence_document_ids: string[]
  source: string
  status: 'observed' | 'adviser_confirmed' | 'disputed'
  notes: string | null
  created_at: string
}

export interface FinanceResidencyFactsResponse extends PagedResponse<FinanceResidencyFact> {
  determination_status: 'requires_human_confirmation'
}

export interface FinanceResidencyFactMutationResult {
  fact: FinanceResidencyFact
  determination_status: 'requires_human_confirmation'
  audit: AuditMetadata
}

export interface FinanceTaxTreatment {
  id: string
  treatment_id: string
  revision_number: number
  event_revision_id: string
  tax_profile_id: string
  jurisdiction: 'SE' | 'ES'
  tax_year: number
  ruleset_id: string
  ruleset_version: string
  category: string
  status: TaxTreatmentStatus
  inputs: Record<string, unknown>
  output: Record<string, unknown>
  rationale: string
  source_citations: Array<Record<string, unknown>>
  missing_facts: string[]
  confirmed_by: string | null
  confirmed_at: string | null
  supersedes_revision_id: string | null
}

export interface FinanceTaxTreatmentConfirmRequest {
  reason: string
  expected_ruleset_version: string
}

export interface FinanceTaxTreatmentMutationResult {
  treatment: FinanceTaxTreatment
  audit: AuditMetadata
}

export interface FinanceReportRun {
  id: string
  tax_profile_id: string
  tax_year: number
  jurisdiction: string
  reporting_currency: string
  status: ReportStatus
  ruleset_versions: Record<string, string>
  algorithm_version: string
  event_revision_ids: string[]
  valuation_ids: string[]
  treatment_ids: string[]
  evidence_document_ids: string[]
  open_question_ids: string[]
  readiness: ReportReadiness
  manifest_sha256: string
  created_at: string
  download: DownloadMetadata | null
}

export interface FinanceReportCreateRequest {
  tax_profile_id: string
  format: 'zip' | 'csv' | 'pdf_summary'
  include_warnings: boolean
  expected_event_revision_ids: string[]
  category?: string
}

export interface FinanceReportMutationResult {
  report: FinanceReportRun
  audit: AuditMetadata
}

// ── v1 additions (see docs/work/plans/finance-module-v1/CONTRACT.md) ──

/** Manual "Add record" — POST /api/finance/events. */
export interface FinanceEventCreate {
  tax_year: number
  occurred_at: string
  event_type: FinanceEventType
  amount: DecimalString
  currency: string
  source_account_id: string
  description: string
  jurisdiction: string | null
  asset_id: string | null
}

/** Edit-as-append-revision — PATCH /api/finance/events/{id}. Omitted fields keep their values. */
export interface FinanceEventPatch {
  expected_revision_id: string
  occurred_at?: string
  event_type?: FinanceEventType
  amount?: DecimalString
  currency?: string
  source_account_id?: string
  description?: string
  jurisdiction?: string | null
  asset_id?: string | null
}

export interface FinanceManualEvent {
  id: string
  current_revision_id: string
  revision_number: number
  status: EventRevisionStatus
  event_type: FinanceEventType
  occurred_at: string
  tax_year: number
  tax_date: string
  amount: DecimalString
  currency: string
  source_account_id: string
  asset_id: string | null
  description: string
  jurisdiction: string | null
}

export interface FinanceEventMutationResult {
  event: FinanceManualEvent
  audit: AuditMetadata
}

export type FinanceTimeseriesMetric =
  | 'net_worth'
  | 'income'
  | 'expense'
  | 'rewards'
  | 'readiness'

export interface FinanceTimeseriesPoint {
  t: string
  v: DecimalString
}

export interface FinanceTimeseriesSeries {
  key: string
  label: string
  points: FinanceTimeseriesPoint[]
}

export interface FinanceTimeseries {
  series: FinanceTimeseriesSeries[]
}

export interface ReviewQueueCounts {
  needs_grouping: number
  needs_evidence: number
  ready: number
  problematic: number
  total: number
}
