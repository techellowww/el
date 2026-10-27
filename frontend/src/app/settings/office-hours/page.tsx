'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OfficeHoursRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/office-timings');
  }, [router]);

  return null;
}
