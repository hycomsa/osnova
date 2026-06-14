import type { TaskConfig } from 'payload'
import { join } from 'node:path'
import { currentRevision, ensureWorktree, invalidateWorktreeFetch, listFiles, withToken } from '@/lib/git/worktree'

// Zadanie w tle: sklonuj/odśwież serwerową kopię roboczą repozytorium workspace'u.
// To długa operacja (klon dużego repo) — uruchamiana asynchronicznie przez kolejkę
// zadań Payloada, by nie blokować żądania HTTP (PRD: zadania w tle z raportowaniem postępu).
export const cloneRepoTask: TaskConfig<{ input: { workspaceId: string }; output: { files: number; revision: string } }> = {
  slug: 'clone-workspace-repo',
  retries: 2,
  inputSchema: [{ name: 'workspaceId', type: 'text', required: true }],
  outputSchema: [
    { name: 'files', type: 'number' },
    { name: 'revision', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const workspaceId = String((input as { workspaceId: string }).workspaceId)

    const bindings = await payload.find({
      collection: 'repo-bindings',
      where: { workspace: { equals: workspaceId } },
      limit: 1,
      overrideAccess: true,
    })
    const binding = bindings.docs[0] as any
    if (!binding) return { state: 'failed', errorMessage: `Workspace ${workspaceId} ma brak podpięcia repo` }

    const branch = String(binding.branch || 'main')
    const dir = join(process.env.WORKTREES_DIR ?? './data/worktrees', workspaceId)
    const token = binding.credentialRef ? process.env[String(binding.credentialRef)] : undefined

    invalidateWorktreeFetch(dir) // wymuś świeży klon/fetch (pomiń throttle)
    await ensureWorktree({ dir, repoUrl: withToken(String(binding.repoUrl), token), branch })

    const files = await listFiles(dir)
    let revision = ''
    try { revision = await currentRevision(dir) } catch { /* puste repo */ }
    return { output: { files: files.length, revision } }
  },
}
