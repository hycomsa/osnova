import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

export default function StyleguidePage() {
  return (
    <main className="osnova-bg min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <h1 className="text-2xl font-light tracking-[0.2em]">osnova — styleguide</h1>
          <p className="text-muted-foreground">git-native · biblioteka komponentów UI</p>
        </header>

        <Card>
          <CardHeader><CardTitle>Przyciski</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Formularze</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Input placeholder="Input…" className="max-w-xs" />
            <Select defaultValue="a">
              <option value="a">direct</option>
              <option value="b">client_business</option>
            </Select>
            <Spinner />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Odznaki</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="accent">accent</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Paleta</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['background', 'card', 'primary', 'accent', 'secondary', 'muted', 'destructive', 'border'].map((c) => (
              <div key={c} className="flex items-center gap-2 text-xs">
                <span className="h-6 w-6 rounded border" style={{ background: `hsl(var(--${c}))` }} />
                {c}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
