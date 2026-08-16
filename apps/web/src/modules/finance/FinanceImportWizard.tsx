import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../components/Field'
import { useDialogFocus } from '../../components/useDialogFocus'
import {
  commitFinanceImport,
  fetchFinanceAccounts,
  previewFinanceImport,
  uploadFinanceEvidence,
} from './api'
import { IconUpload, IconWarning, StatusPill, WarningList } from './primitives'
import type {
  FinanceAccount,
  ImportCommitResult,
  ImportMapping,
  ImportPreview,
  ImportRowOverride,
  PdfStatementRow,
} from './types'

type ParserId =
  | 'csv'
  | 'json'
  | 'pdf_statement'
  | 'image_metadata'
  | 'archive_manifest'

const PARSER_BY_MEDIA_TYPE: Record<string, ParserId> = {
  'text/csv': 'csv',
  'application/json': 'json',
  // PDF statements parse into ledger rows via pdftotext heuristics (contract §PDF statement import).
  'application/pdf': 'pdf_statement',
  'image/png': 'image_metadata',
  'image/jpeg': 'image_metadata',
  'image/webp': 'image_metadata',
  'application/zip': 'archive_manifest',
  'application/x-tar': 'archive_manifest',
}

// ponytail: opaque client parser-version tag, not a user-facing choice — bump if the
// column-mapping form materially changes what it sends.
const PARSER_VERSION = '1'

const SOURCE_KIND_SUGGESTIONS = [
  'bank_statement',
  'broker_statement',
  'exchange_export',
  'crypto_wallet_export',
  'invoice',
  'receipt',
  'contract',
  'other',
]

const MAPPING_COLUMN_FIELDS: { key: keyof ImportMapping; label: string }[] = [
  { key: 'date_column', label: 'Date column' },
  { key: 'time_column', label: 'Time column' },
  { key: 'amount_column', label: 'Amount column' },
  { key: 'quantity_column', label: 'Quantity column' },
  { key: 'asset_column', label: 'Asset column' },
  { key: 'description_column', label: 'Description column' },
  { key: 'external_id_column', label: 'External ID column' },
  { key: 'event_type_column', label: 'Event type column' },
]

type Step = 'select' | 'map' | 'done'

function emptyMapping(): ImportMapping {
  return { decimal_separator: '.' }
}

const CONFIDENCE_TONE = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
} as const

/** Editable preview of heuristically parsed PDF statement rows — corrections go to commit as row_overrides. */
function PdfRowsEditor({
  rows,
  unparsedLineCount,
  edits,
  excluded,
  onEdit,
  onToggleExcluded,
}: {
  rows: PdfStatementRow[]
  unparsedLineCount: number
  edits: Map<string, ImportRowOverride>
  excluded: Set<string>
  onEdit: (
    sourceIndex: string,
    field: 'date' | 'description' | 'amount' | 'currency',
    value: string,
  ) => void
  onToggleExcluded: (sourceIndex: string, include: boolean) => void
}) {
  const value = (
    row: PdfStatementRow,
    field: 'date' | 'description' | 'amount' | 'currency',
  ) => edits.get(row.source_index)?.[field] ?? row[field] ?? ''
  return (
    <div className="fin-inspector-section">
      <span className="finance-section-label">Parsed rows ({rows.length})</span>
      {unparsedLineCount > 0 && (
        <p className="finance-muted">
          <IconWarning /> {unparsedLineCount} line
          {unparsedLineCount === 1 ? '' : 's'} could not be parsed and will be
          skipped. Check the source PDF if totals look short.
        </p>
      )}
      <div className="fin-table-wrap">
        <table className="fin-table fin-pdf-rows">
          <thead>
            <tr>
              <th>
                <span className="sr-only">Include</span>
              </th>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.source_index}
                className={
                  excluded.has(row.source_index)
                    ? 'fin-row-excluded'
                    : row.confidence === 'low'
                      ? 'fin-row-low-confidence'
                      : ''
                }
                title={row.source_line}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={!excluded.has(row.source_index)}
                    onChange={(e) =>
                      onToggleExcluded(row.source_index, e.target.checked)
                    }
                    aria-label={`Include row ${row.source_index}`}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={value(row, 'date')}
                    onChange={(e) =>
                      onEdit(row.source_index, 'date', e.target.value)
                    }
                    aria-label={`Date for row ${row.source_index}`}
                  />
                </td>
                <td>
                  <input
                    value={value(row, 'description')}
                    onChange={(e) =>
                      onEdit(row.source_index, 'description', e.target.value)
                    }
                    aria-label={`Description for row ${row.source_index}`}
                  />
                </td>
                <td>
                  <input
                    className="finance-mono"
                    inputMode="decimal"
                    value={value(row, 'amount')}
                    onChange={(e) =>
                      onEdit(row.source_index, 'amount', e.target.value)
                    }
                    aria-label={`Amount for row ${row.source_index}`}
                  />
                </td>
                <td>
                  <input
                    className="finance-mono"
                    maxLength={8}
                    value={value(row, 'currency')}
                    onChange={(e) =>
                      onEdit(row.source_index, 'currency', e.target.value)
                    }
                    aria-label={`Currency for row ${row.source_index}`}
                  />
                </td>
                <td>
                  <StatusPill tone={CONFIDENCE_TONE[row.confidence]}>
                    {row.confidence}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FinanceImportWizard({
  onClose,
  onCommitted,
}: {
  onClose: () => void
  onCommitted: () => void
}) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [step, setStep] = useState<Step>('select')
  const [accountId, setAccountId] = useState('')
  const [sourceKind, setSourceKind] = useState('bank_statement')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [parserId, setParserId] = useState<ParserId | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())
  const [rowEdits, setRowEdits] = useState<Map<string, ImportRowOverride>>(
    new Map(),
  )
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ImportCommitResult | null>(null)

  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus({ open: true, dialogRef, onEscape: onClose })

  useEffect(() => {
    void fetchFinanceAccounts({ limit: 200 }).then((page) => {
      setAccounts(page.items)
      if (page.items.length > 0)
        setAccountId((prev) => prev || page.items[0].id)
    })
  }, [])

  const requiredWarningCodes = useMemo(
    () =>
      new Set(
        (preview?.warnings ?? [])
          .filter((w) => w.severity === 'warning' || w.severity === 'blocking')
          .map((w) => w.code),
      ),
    [preview],
  )
  const allAcknowledged = [...requiredWarningCodes].every((code) =>
    acknowledged.has(code),
  )

  async function runPreview(
    nextMapping: ImportMapping,
    evidence: string,
    account: string,
    parser: ParserId,
  ) {
    setPreviewing(true)
    setError(null)
    try {
      const result = await previewFinanceImport(
        {
          evidence_document_id: evidence,
          account_id: account,
          parser_id: parser,
          parser_version: PARSER_VERSION,
          import_mode: 'normal',
          mapping: nextMapping,
        },
        crypto.randomUUID(),
      )
      setPreview(result)
      setAcknowledged(new Set())
      setRowEdits(new Map())
      setExcludedRows(new Set())
      setStep('map')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not preview import')
    } finally {
      setPreviewing(false)
    }
  }

  async function submitUpload(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !accountId) {
      setError('An account and a file are required.')
      return
    }
    const parser = PARSER_BY_MEDIA_TYPE[file.type]
    if (!parser) {
      setError(
        `Unsupported file type "${file.type || 'unknown'}". Use CSV, JSON, PDF, an image, or a zip/tar archive.`,
      )
      return
    }
    setUploading(true)
    setError(null)
    try {
      const evidence = await uploadFinanceEvidence(
        { file, source_kind: sourceKind },
        crypto.randomUUID(),
      )
      setEvidenceId(evidence.id)
      setParserId(parser)
      await runPreview(emptyMapping(), evidence.id, accountId, parser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload evidence')
    } finally {
      setUploading(false)
    }
  }

  async function applyMapping() {
    if (!evidenceId || !parserId) return
    await runPreview(mapping, evidenceId, accountId, parserId)
  }

  async function commit() {
    if (!preview) return
    setCommitting(true)
    setError(null)
    try {
      const commitResult = await commitFinanceImport(
        preview.import_id,
        {
          mapping,
          confirm_warnings: [...requiredWarningCodes],
          ...(rowEdits.size > 0
            ? { row_overrides: [...rowEdits.values()] }
            : {}),
          ...(excludedRows.size > 0
            ? { excluded_source_indexes: [...excludedRows] }
            : {}),
        },
        crypto.randomUUID(),
      )
      setResult(commitResult)
      setStep('done')
      onCommitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not commit import')
    } finally {
      setCommitting(false)
    }
  }

  return createPortal(
    <div
      className="scope-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="scope-card fin-import-modal" ref={dialogRef}>
        <h3 id={titleId}>Import a statement</h3>

        {step === 'select' && (
          <form className="fin-import-form" onSubmit={submitUpload}>
            <Field label="Account">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source kind">
              <input
                list="fin-source-kind-options"
                value={sourceKind}
                onChange={(e) => setSourceKind(e.target.value)}
                placeholder="bank_statement"
              />
              <datalist id="fin-source-kind-options">
                {SOURCE_KIND_SUGGESTIONS.map((kind) => (
                  <option key={kind} value={kind} />
                ))}
              </datalist>
            </Field>
            <Field label="File">
              <input
                type="file"
                accept=".csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.zip,.tar"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            {error && <p className="fin-muted-danger">{error}</p>}
            <p className="finance-muted">
              CSV, JSON, PDF statement, image, or a zip/tar archive of
              documents. The parser is picked automatically from the file type.
            </p>
            <div className="cal-card-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={uploading || !accounts.length}
              >
                {uploading ? 'Uploading…' : 'Upload & preview'}
              </button>
            </div>
          </form>
        )}

        {step === 'map' && preview && (
          <div className="fin-import-form">
            <div className="fin-import-summary">
              <span>
                <strong>{preview.expected_record_count}</strong> records
              </span>
              <span>
                <strong>{preview.duplicate_record_count}</strong> already
                imported
              </span>
              <span>
                <strong>{preview.rejected_record_count}</strong> rejected
              </span>
              {preview.duplicate_file && (
                <span className="fin-muted-danger">
                  This exact file was already imported.
                </span>
              )}
            </div>

            {preview.columns.length > 0 && (
              <>
                <span className="finance-section-label">Column mapping</span>
                <div className="fin-mapping-grid">
                  {MAPPING_COLUMN_FIELDS.map(({ key, label }) => (
                    <Field key={key} label={label}>
                      <select
                        value={(mapping[key] as string | undefined) ?? ''}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [key]: e.target.value || undefined,
                          }))
                        }
                      >
                        <option value="">—</option>
                        {preview.columns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="Decimal separator">
                    <select
                      value={mapping.decimal_separator ?? '.'}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          decimal_separator: e.target.value as '.' | ',',
                        }))
                      }
                    >
                      <option value=".">. (1234.56)</option>
                      <option value=",">, (1234,56)</option>
                    </select>
                  </Field>
                  <Field label="Timezone">
                    <input
                      value={mapping.timezone ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          timezone: e.target.value || undefined,
                        }))
                      }
                      placeholder="UTC"
                    />
                  </Field>
                  <Field label="Date format">
                    <input
                      value={mapping.date_format ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          date_format: e.target.value || undefined,
                        }))
                      }
                      placeholder="auto-detect"
                    />
                  </Field>
                </div>
                <div className="fin-import-form-actions">
                  <button
                    type="button"
                    className="fin-btn fin-btn-ghost fin-btn-sm"
                    onClick={() => void applyMapping()}
                    disabled={previewing}
                  >
                    {previewing
                      ? 'Re-previewing…'
                      : 'Apply mapping & re-preview'}
                  </button>
                </div>
              </>
            )}

            {preview.source_format === 'pdf' && preview.rows ? (
              <PdfRowsEditor
                rows={preview.rows}
                unparsedLineCount={preview.unparsed_line_count ?? 0}
                edits={rowEdits}
                excluded={excludedRows}
                onEdit={(sourceIndex, field, value) =>
                  setRowEdits((prev) => {
                    const next = new Map(prev)
                    next.set(sourceIndex, {
                      ...next.get(sourceIndex),
                      source_index: sourceIndex,
                      [field]: value,
                    })
                    return next
                  })
                }
                onToggleExcluded={(sourceIndex, include) =>
                  setExcludedRows((prev) => {
                    const next = new Set(prev)
                    if (include) next.delete(sourceIndex)
                    else next.add(sourceIndex)
                    return next
                  })
                }
              />
            ) : (
              preview.sample_rows.length > 0 && (
                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        {preview.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample_rows.slice(0, 5).map((row, index) => (
                        <tr key={index}>
                          {preview.columns.map((column) => (
                            <td key={column}>{row[column] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {preview.rejected_rows.length > 0 && (
              <div className="fin-inspector-section">
                <span className="finance-section-label">
                  Rejected rows ({preview.rejected_record_count})
                </span>
                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Code</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rejected_rows.slice(0, 10).map((row) => (
                        <tr key={row.source_index}>
                          <td>{row.source_index}</td>
                          <td>{row.code}</td>
                          <td>{row.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="fin-inspector-section">
                <span className="finance-section-label">Warnings</span>
                <WarningList warnings={preview.warnings} />
                <div className="fin-ack-list">
                  {[...requiredWarningCodes].map((code) => (
                    <label key={code} className="fin-ack-row">
                      <input
                        type="checkbox"
                        checked={acknowledged.has(code)}
                        onChange={(e) =>
                          setAcknowledged((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(code)
                            else next.delete(code)
                            return next
                          })
                        }
                      />
                      I acknowledge <code>{code}</code>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="fin-muted-danger">{error}</p>}
            <div className="cal-card-actions">
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void commit()}
                disabled={committing || !allAcknowledged}
              >
                {committing ? 'Committing…' : 'Commit import'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="fin-import-form">
            <div className="fin-import-result">
              <IconUpload />
              <div>
                <strong>
                  {result.created_event_count} new event
                  {result.created_event_count === 1 ? '' : 's'}
                </strong>
                <p className="finance-muted">
                  {result.duplicate_record_count} already imported ·{' '}
                  {result.rejected_record_count} rejected ·{' '}
                  {result.review_group_ids.length} group
                  {result.review_group_ids.length === 1 ? '' : 's'} created for
                  review
                </p>
              </div>
            </div>
            <div className="cal-card-actions">
              <button type="button" className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {step === 'select' && accounts.length === 0 && (
          <p className="finance-muted">
            <IconWarning /> Add a source account first (Activity → Sources).
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
