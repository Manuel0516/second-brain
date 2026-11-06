import { apiCall, apiErrorMessage } from './api'

export interface FileUpload {
  id: string
  url: string
  name: string
  content_type: string
  size: number
  created_at: string
}

export async function uploadFile(file: File): Promise<FileUpload> {
  const body = new FormData()
  body.append('file', file)
  const response = await apiCall('/api/files', { method: 'POST', body })
  if (!response.ok)
    throw new Error(await apiErrorMessage(response, 'Failed to upload file'))
  return response.json()
}
