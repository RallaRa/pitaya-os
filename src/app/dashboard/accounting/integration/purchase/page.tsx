import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/dashboard/accounting/integration/auto?tab=purchase');
}
