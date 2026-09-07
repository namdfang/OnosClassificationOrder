import { redirect } from 'next/navigation';

/** Dashboard seller làm ở PR-C — tạm về danh sách đơn. */
export default function PortalHome() {
  redirect('/portal/orders');
}
