import Topbar from '../components/Topbar';
import ComposeForm from '../components/ComposeForm';
import { Card, CardContent } from '@/components/ui/card';

export default function ManualSms() {
  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar title="New text" subtitle="Pick a contact or type a number, then send." />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <ComposeForm />
        </CardContent>
      </Card>
    </div>
  );
}
