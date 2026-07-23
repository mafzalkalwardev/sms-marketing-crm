import Topbar from '../components/Topbar';
import ThemeToggle from '../components/ThemeToggle';
import Button from '../components/Button';
import useWorkspace from '../hooks/useWorkspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Settings({ setPage }) {
  const workspace = useWorkspace();

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar title="Settings" subtitle="Appearance and messaging preferences" />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose light, dark, or match your device.</p>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your business lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {workspace.data?.hint || 'Assigned numbers route through the platform dialer automatically.'}
            </p>
            {!workspace.data?.lines?.length && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                No lines assigned yet. Ask your admin or add one under My numbers.
              </div>
            )}
            {workspace.data?.lines?.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <strong className="block text-sm">{line.label}</strong>
                  <small className="text-muted-foreground">{line.phone}</small>
                </div>
                {line.isDefault && <Badge variant="success">Default</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">View opt-outs, suppression list, and export STOP audit data.</p>
            {setPage && (
              <Button variant="ghost" onClick={() => setPage('compliance')}>Open compliance</Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-input" defaultChecked />
              Show unread badges in inbox
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-input" defaultChecked />
              Play sound on new reply (coming soon)
            </label>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
