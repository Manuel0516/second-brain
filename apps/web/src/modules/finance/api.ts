import { apiCall, apiErrorMessage } from '../../lib/api'
import type {
  AuditMetadata,
  DownloadMetadata,
  EventLineage,
  EventRevisionStatus,
  FinanceAccount,
  FinanceAccountCreate,
  FinanceActivityItem,
  FinanceAssistantToolName,
  FinanceAssistantToolRequest,
  FinanceAssistantToolResult,
  FinanceAsset,
  FinanceAssetCreate,
  FinanceEvidence,
  FinanceEvidenceUploadRequest,
  FinanceEventType,
  FinanceImportSummary,
  FinanceProposalConfirmRequest,
  FinanceProposalCreateRequest,
  FinanceProposalMutationResult,
  FinanceProposalRejectRequest,
  FinanceRawRecord,
  FinanceReconciliation,
  FinanceReconciliationRunRequest,
  FinanceReconciliationRunResult,
  FinanceReportCreateRequest,
  FinanceReportMutationResult,
  FinanceReportRun,
  FinanceResidencyFactCreate,
  FinanceResidencyFactMutationResult,
  FinanceResidencyFactsResponse,
  FinanceSourceConnection,
  FinanceSourceConnectionCreate,
  FinanceSummary,
  FinanceTaxProfile,
  FinanceTaxProfileCreate,
  FinanceTaxTreatment,
  FinanceTaxTreatmentConfirmRequest,
  FinanceTaxTreatmentMutationResult,
  ImportCommitRequest,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
  PagedResponse,
  ReviewConfirmRequest,
  ReviewConfirmResult,
  ReviewDeferRequest,
  ReviewDeferResult,
  ReviewGroup,
  ReviewSplitRequest,
  ReviewSplitResult,
  ReviewStatus,
} from './types'

type QueryValue = string | number | boolean | null | undefined

export interface FinancePaginationQuery {
  limit?: number
  offset?: number
}

async function financeJson<T>(
  path: string,
  options: RequestInit = {},
  fallback = 'Finance request failed',
): Promise<T> {
  const response = await apiCall(`/api/finance${path}`, options)
  if (!response.ok) throw new Error(await apiErrorMessage(response, fallback))
  return (await response.json()) as T
}

function withQuery(path: string, query: object = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query) as Array<
    [string, QueryValue]
  >) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

function financeMutation<T>(
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<T> {
  return financeJson<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
}

export function fetchFinanceSummary(
  taxYear: number,
  jurisdiction?: string,
  reportingCurrency?: string,
): Promise<FinanceSummary> {
  return financeJson<FinanceSummary>(
    withQuery('/summary', {
      tax_year: taxYear,
      jurisdiction,
      reporting_currency: reportingCurrency,
    }),
  )
}

export function fetchFinanceActivity(
  query: FinanceActivityQuery = {},
): Promise<PagedResponse<FinanceActivityItem>> {
  return financeJson<PagedResponse<FinanceActivityItem>>(
    withQuery('/activity', query),
  )
}

export interface FinanceActivityQuery {
  view?: 'grouped' | 'raw'
  from?: string
  to?: string
  account_id?: string
  asset_id?: string
  event_type?: FinanceEventType
  status?: EventRevisionStatus
  limit?: number
  offset?: number
}

export function fetchFinanceEventLineage(
  eventId: string,
): Promise<EventLineage> {
  return financeJson<EventLineage>(
    `/events/${encodeURIComponent(eventId)}/lineage`,
  )
}

export function fetchFinanceAccounts(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceAccount>> {
  return financeJson<PagedResponse<FinanceAccount>>(
    withQuery('/accounts', query),
  )
}

export function createFinanceAccount(
  account: FinanceAccountCreate,
  idempotencyKey: string,
): Promise<{ account: FinanceAccount; audit: AuditMetadata }> {
  return financeMutation('/accounts', account, idempotencyKey)
}

export function fetchFinanceAssets(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceAsset>> {
  return financeJson<PagedResponse<FinanceAsset>>(withQuery('/assets', query))
}

export function createFinanceAsset(
  asset: FinanceAssetCreate,
  idempotencyKey: string,
): Promise<{ asset: FinanceAsset; audit: AuditMetadata }> {
  return financeMutation('/assets', asset, idempotencyKey)
}

export function fetchFinanceSourceConnections(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceSourceConnection>> {
  return financeJson<PagedResponse<FinanceSourceConnection>>(
    withQuery('/source-connections', query),
  )
}

export function createFinanceSourceConnection(
  sourceConnection: FinanceSourceConnectionCreate,
  idempotencyKey: string,
): Promise<{
  source_connection: FinanceSourceConnection
  audit: AuditMetadata
}> {
  return financeMutation(
    '/source-connections',
    sourceConnection,
    idempotencyKey,
  )
}

export function uploadFinanceEvidence(
  request: FinanceEvidenceUploadRequest,
  idempotencyKey: string,
): Promise<FinanceEvidence> {
  const form = new FormData()
  form.set('file', request.file)
  form.set('source_kind', request.source_kind)
  if (request.captured_at != null) form.set('captured_at', request.captured_at)
  if (request.coverage_start != null)
    form.set('coverage_start', request.coverage_start)
  if (request.coverage_end != null)
    form.set('coverage_end', request.coverage_end)

  return financeJson<FinanceEvidence>('/evidence', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form,
  })
}

export function fetchFinanceEvidence(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceEvidence>> {
  return financeJson<PagedResponse<FinanceEvidence>>(
    withQuery('/evidence', query),
  )
}

export function previewFinanceImport(
  request: ImportPreviewRequest,
  idempotencyKey: string,
): Promise<ImportPreview> {
  return financeMutation('/imports/preview', request, idempotencyKey)
}

export function commitFinanceImport(
  importId: string,
  request: ImportCommitRequest,
  idempotencyKey: string,
): Promise<ImportCommitResult> {
  return financeMutation(
    `/imports/${encodeURIComponent(importId)}/commit`,
    request,
    idempotencyKey,
  )
}

export function fetchFinanceImports(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceImportSummary>> {
  return financeJson<PagedResponse<FinanceImportSummary>>(
    withQuery('/imports', query),
  )
}

export function fetchFinanceImportRawRecords(
  importId: string,
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceRawRecord>> {
  return financeJson<PagedResponse<FinanceRawRecord>>(
    withQuery(`/imports/${encodeURIComponent(importId)}/raw-records`, query),
  )
}

export function fetchReviewGroups(
  reviewStatus?: ReviewStatus,
  limit = 50,
  offset = 0,
): Promise<PagedResponse<ReviewGroup>> {
  return financeJson<PagedResponse<ReviewGroup>>(
    withQuery('/review-groups', {
      status: reviewStatus,
      limit,
      offset,
    }),
  )
}

export function confirmReviewGroup(
  groupId: string,
  body: ReviewConfirmRequest,
  idempotencyKey: string,
): Promise<ReviewConfirmResult> {
  return financeMutation(
    `/review-groups/${encodeURIComponent(groupId)}/confirm`,
    body,
    idempotencyKey,
  )
}

export function splitReviewGroup(
  groupId: string,
  body: ReviewSplitRequest,
  idempotencyKey: string,
): Promise<ReviewSplitResult> {
  return financeMutation(
    `/review-groups/${encodeURIComponent(groupId)}/split`,
    body,
    idempotencyKey,
  )
}

export function deferReviewGroup(
  groupId: string,
  body: ReviewDeferRequest,
  idempotencyKey: string,
): Promise<ReviewDeferResult> {
  return financeMutation(
    `/review-groups/${encodeURIComponent(groupId)}/defer`,
    body,
    idempotencyKey,
  )
}

export function fetchFinanceReconciliations(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceReconciliation>> {
  return financeJson<PagedResponse<FinanceReconciliation>>(
    withQuery('/reconciliations', query),
  )
}

export function runFinanceReconciliation(
  request: FinanceReconciliationRunRequest,
  idempotencyKey: string,
): Promise<FinanceReconciliationRunResult> {
  return financeMutation('/reconciliations/run', request, idempotencyKey)
}

export function fetchFinanceTaxProfiles(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceTaxProfile>> {
  return financeJson<PagedResponse<FinanceTaxProfile>>(
    withQuery('/tax-profiles', query),
  )
}

export function createFinanceTaxProfile(
  profile: FinanceTaxProfileCreate,
  idempotencyKey: string,
): Promise<{ profile: FinanceTaxProfile; audit: AuditMetadata }> {
  return financeMutation('/tax-profiles', profile, idempotencyKey)
}

export function fetchFinanceResidencyFacts(
  taxProfileId: string,
  query: FinancePaginationQuery = {},
): Promise<FinanceResidencyFactsResponse> {
  return financeJson<FinanceResidencyFactsResponse>(
    withQuery(
      `/tax-profiles/${encodeURIComponent(taxProfileId)}/residency-facts`,
      query,
    ),
  )
}

export function createFinanceResidencyFact(
  taxProfileId: string,
  fact: FinanceResidencyFactCreate,
  idempotencyKey: string,
): Promise<FinanceResidencyFactMutationResult> {
  return financeMutation(
    `/tax-profiles/${encodeURIComponent(taxProfileId)}/residency-facts`,
    fact,
    idempotencyKey,
  )
}

export function fetchFinanceTaxTreatments(
  taxProfileId: string,
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceTaxTreatment>> {
  return financeJson<PagedResponse<FinanceTaxTreatment>>(
    withQuery(
      `/tax-profiles/${encodeURIComponent(taxProfileId)}/treatments`,
      query,
    ),
  )
}

export function confirmFinanceTaxTreatment(
  treatmentRevisionId: string,
  request: FinanceTaxTreatmentConfirmRequest,
  idempotencyKey: string,
): Promise<FinanceTaxTreatmentMutationResult> {
  return financeMutation(
    `/tax-treatments/${encodeURIComponent(treatmentRevisionId)}/confirm`,
    request,
    idempotencyKey,
  )
}

export function createFinanceReport(
  request: FinanceReportCreateRequest,
  idempotencyKey: string,
): Promise<FinanceReportMutationResult> {
  return financeMutation('/reports', request, idempotencyKey)
}

export function fetchFinanceReports(
  query: FinancePaginationQuery = {},
): Promise<PagedResponse<FinanceReportRun>> {
  return financeJson<PagedResponse<FinanceReportRun>>(
    withQuery('/reports', query),
  )
}

export function fetchFinanceReport(
  reportId: string,
): Promise<FinanceReportRun> {
  return financeJson<FinanceReportRun>(
    `/reports/${encodeURIComponent(reportId)}`,
  )
}

export function fetchFinanceReportDownload(
  reportId: string,
): Promise<DownloadMetadata> {
  return financeJson<DownloadMetadata>(
    `/reports/${encodeURIComponent(reportId)}/download`,
  )
}

export function runFinanceAssistantTool(
  toolName: FinanceAssistantToolName,
  request: FinanceAssistantToolRequest,
): Promise<FinanceAssistantToolResult> {
  return financeJson(`/assistant/tools/${encodeURIComponent(toolName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export function createFinanceAssistantProposal(
  request: FinanceProposalCreateRequest,
  idempotencyKey: string,
): Promise<FinanceProposalMutationResult> {
  return financeMutation('/assistant/proposals', request, idempotencyKey)
}

export function confirmFinanceAssistantProposal(
  proposalId: string,
  request: FinanceProposalConfirmRequest,
  idempotencyKey: string,
): Promise<FinanceProposalMutationResult> {
  return financeMutation(
    `/assistant/proposals/${encodeURIComponent(proposalId)}/confirm`,
    request,
    idempotencyKey,
  )
}

export function rejectFinanceAssistantProposal(
  proposalId: string,
  request: FinanceProposalRejectRequest,
  idempotencyKey: string,
): Promise<FinanceProposalMutationResult> {
  return financeMutation(
    `/assistant/proposals/${encodeURIComponent(proposalId)}/reject`,
    request,
    idempotencyKey,
  )
}
