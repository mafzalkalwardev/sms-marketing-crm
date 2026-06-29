import Topbar from '../components/Topbar';
import DialerWorkspace from '../components/DialerWorkspace';

export default function ManualSms() {
  return (
    <>
      <Topbar title="Dialpad" subtitle="Send a business text by number or contact" />
      <DialerWorkspace />
    </>
  );
}
