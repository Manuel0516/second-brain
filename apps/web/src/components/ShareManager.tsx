import { useRef, useState } from 'react'
import { apiCall, apiErrorMessage } from '../lib/api'
import { Popover } from './Popover'
import { IconButton } from './IconButton'
import './ShareManager.css'

export type Collaborator = {
  user_id: string
  email: string
  role: 'viewer' | 'editor'
}

export function ShareManager({
  resource,
  resourceId,
  collaborators,
  owner,
  effectiveRole,
  ownerEmail,
  ownerName,
  onChanged,
}: {
  resource: 'pages' | 'calendars'
  resourceId: string
  collaborators: Collaborator[]
  owner: boolean
  effectiveRole?: 'editor' | 'viewer'
  ownerEmail?: string | null
  ownerName?: string | null
  onChanged: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [error, setError] = useState('')
  const endpoint = `/api/${resource}/${resourceId}/shares`

  const share = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const response = await apiCall(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    if (!response.ok) {
      setError(await apiErrorMessage(response, 'Could not share this item.'))
      return
    }
    setEmail('')
    onChanged()
  }
  const update = async (
    person: Collaborator,
    nextRole: Collaborator['role'],
  ) => {
    const response = await apiCall(`${endpoint}/${person.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    if (response.ok) onChanged()
    else setError(await apiErrorMessage(response, 'Could not update access.'))
  }
  const revoke = async (person: Collaborator) => {
    const response = await apiCall(`${endpoint}/${person.user_id}`, {
      method: 'DELETE',
    })
    if (response.ok) onChanged()
    else setError(await apiErrorMessage(response, 'Could not revoke access.'))
  }

  if (!owner)
    return (
      <span className="share-role">
        Shared · {ownerName || ownerEmail || 'owner'} ·{' '}
        {effectiveRole || 'viewer'}
      </span>
    )
  return (
    <div className="share-manager">
      <button
        ref={triggerRef}
        type="button"
        className="share-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Share{collaborators.length ? ` · ${collaborators.length}` : ''}
      </button>
      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        className="share-popover"
        align="end"
        role="dialog"
        ariaLabel="Sharing settings"
      >
        <div className="share-popover-head">
          <h3>Share</h3>
          <IconButton
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            }
            label="Close"
            onClick={() => setOpen(false)}
            size="sm"
          />
        </div>
        <form onSubmit={share} className="share-form">
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Existing account email"
            aria-label="Existing account email"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            aria-label="Access role"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button className="primary" type="submit">
            Invite
          </button>
        </form>
        {error && (
          <p className="share-error" role="alert">
            {error}
          </p>
        )}
        {collaborators.map((person) => (
          <div className="share-person" key={person.user_id}>
            <span>{person.email}</span>
            <select
              value={person.role}
              onChange={(event) =>
                void update(person, event.target.value as Collaborator['role'])
              }
              aria-label={`${person.email} role`}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              type="button"
              className="danger"
              onClick={() => void revoke(person)}
            >
              Revoke
            </button>
          </div>
        ))}
      </Popover>
    </div>
  )
}
