'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ScreenshotSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/screenshot');
  }, [router]);

  return null;
}
