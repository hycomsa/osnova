import { redirect } from 'next/navigation'

// Lista workspace'ów mieszka na stronie głównej; /workspaces to wygodny alias (był 404).
export default function WorkspacesIndex() {
  redirect('/')
}
