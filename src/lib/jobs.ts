import type { Payload } from 'payload'

export type RepoSyncStatus = {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  processing: boolean
  completedAt: string | null
  hasError: boolean
  error: string | null
  output: { files?: number; revision?: string } | null
  totalTried: number
}

// Zakolejkuj klon/odświeżenie repo i od razu uruchom przetwarzanie (nie czekając na wynik).
// W jednym procesie Next to wystarcza; w produkcji zamiast tego cron/bin `payload jobs:run`.
export async function enqueueRepoSync(payload: Payload, workspaceId: string | number): Promise<string> {
  const job = await payload.jobs.queue({ task: 'clone-workspace-repo', input: { workspaceId: String(workspaceId) } })
  void payload.jobs.run({ queue: 'default' }).catch((e) =>
    console.warn('[osnova] jobs.run failed:', String((e as Error).message).split('\n')[0]),
  )
  return String(job.id)
}

// Status ostatniego zadania synchronizacji dla danego workspace'u (do pollingu w UI).
export async function latestRepoSyncStatus(payload: Payload, workspaceId: string | number): Promise<RepoSyncStatus | null> {
  const res = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: 'clone-workspace-repo' } },
    sort: '-createdAt',
    limit: 50,
    overrideAccess: true,
  })
  // input to JSON — filtr po workspaceId robimy w kodzie (niezależnie od adaptera DB)
  const job = (res.docs as any[]).find((j) => String(j.input?.workspaceId) === String(workspaceId))
  if (!job) return null
  const status: RepoSyncStatus['status'] = job.hasError ? 'failed' : job.completedAt ? 'done' : job.processing ? 'running' : 'queued'
  // wynik zadania Payload trzyma w logu (payload_jobs_log), nie w polu na samym zadaniu
  const log: any[] = Array.isArray(job.log) ? job.log : []
  const lastRun = [...log].reverse().find((l) => l?.taskSlug === 'clone-workspace-repo' && l?.output)
  return {
    id: String(job.id),
    status,
    processing: Boolean(job.processing),
    completedAt: job.completedAt ?? null,
    hasError: Boolean(job.hasError),
    error: job.error ? String(job.error?.message ?? job.error) : null,
    output: lastRun?.output ?? null,
    totalTried: job.totalTried ?? 0,
  }
}
