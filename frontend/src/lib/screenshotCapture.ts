interface CaptureParams {
  userId: string;
  userName: string;
  employeeId: string;
  timeEntryId: string;
  projectCode: string;
  projectName: string;
  elapsedSeconds: number;
  intervalMinutes: number;
  intervalIndex?: number;
}

// MediaStream singleton for holding the employee's active screen share stream
let activeScreenStream: MediaStream | null = null;
let activeVideoElement: HTMLVideoElement | null = null;

type StreamChangeListener = (isActive: boolean) => void;
const streamChangeListeners: Set<StreamChangeListener> = new Set();

export function onScreenStreamChange(listener: StreamChangeListener): () => void {
  streamChangeListeners.add(listener);
  return () => {
    streamChangeListeners.delete(listener);
  };
}

function notifyStreamChange(isActive: boolean) {
  streamChangeListeners.forEach((listener) => {
    try {
      listener(isActive);
    } catch (err) {
      console.error('[ScreenCapture] Listener error:', err);
    }
  });
}

/**
 * Requests the employee to share their entire screen / desktop display via the browser Screen Capture API.
 * The stream is kept alive for the duration of the active timer session so frames can be captured periodically.
 */
export async function requestScreenStream(): Promise<MediaStream | null> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    console.warn('[ScreenCapture] Screen Capture API is not supported in this browser environment.');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        frameRate: { max: 15 },
      } as any,
      audio: false,
    });

    activeScreenStream = stream;

    // Attach to an active video element so all browser engines (Chrome, Firefox, Edge) continuously render frames
    if (!activeVideoElement) {
      activeVideoElement = document.createElement('video');
      activeVideoElement.autoplay = true;
      activeVideoElement.muted = true;
      activeVideoElement.playsInline = true;
      activeVideoElement.style.position = 'fixed';
      activeVideoElement.style.top = '0';
      activeVideoElement.style.left = '0';
      activeVideoElement.style.width = '160px';
      activeVideoElement.style.height = '90px';
      activeVideoElement.style.opacity = '0.001';
      activeVideoElement.style.zIndex = '-9999';
      activeVideoElement.style.pointerEvents = 'none';
      document.body.appendChild(activeVideoElement);
    }

    activeVideoElement.srcObject = stream;

    // Ensure the video element plays and starts decoding frames
    try {
      await activeVideoElement.play();
    } catch {
      // autoplay might be deferred until user gesture
    }

    // Wait until video has valid dimensions and ready state
    let attempts = 0;
    while (attempts < 20 && (!activeVideoElement.videoWidth || activeVideoElement.readyState < 2)) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    // If requestVideoFrameCallback is supported, wait for first painted frame
    if ('requestVideoFrameCallback' in activeVideoElement) {
      await new Promise<void>((resolve) => {
        (activeVideoElement as any).requestVideoFrameCallback(() => resolve());
        setTimeout(resolve, 300);
      });
    }

    // Listen for employee manually ending the share (e.g. clicking "Stop sharing" floating bar)
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        stopScreenStream();
      };
    }

    notifyStreamChange(true);
    return stream;
  } catch (err) {
    console.warn('[ScreenCapture] User dismissed or declined screen sharing prompt:', err);
    notifyStreamChange(false);
    return null;
  }
}

export function stopScreenStream() {
  if (activeScreenStream) {
    activeScreenStream.getTracks().forEach((track) => track.stop());
    activeScreenStream = null;
  }
  if (activeVideoElement) {
    activeVideoElement.srcObject = null;
    activeVideoElement.remove();
    activeVideoElement = null;
  }
  notifyStreamChange(false);
}

export function isScreenStreamActive(): boolean {
  if (!activeScreenStream) return false;
  return activeScreenStream.getVideoTracks().some((t) => t.readyState === 'live');
}

/**
 * Captures the user's actual live screen from the active screen display stream.
 * Returns null if screen sharing is not active (NEVER generates fake drawings or mockups).
 */
export async function captureUserScreen(params: CaptureParams): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  if (!isScreenStreamActive()) {
    console.warn('[ScreenCapture] Screen stream is inactive; cannot capture workstation screen.');
    return null;
  }

  const track = activeScreenStream?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') {
    return null;
  }

  // 1. Try ImageCapture API first (Chrome, Edge)
  if (typeof (window as any).ImageCapture !== 'undefined') {
    try {
      const imageCapture = new (window as any).ImageCapture(track);
      let bitmap: ImageBitmap | null = null;
      for (let retries = 0; retries < 3; retries++) {
        try {
          bitmap = await imageCapture.grabFrame();
          if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (dataUrl && dataUrl.length > 2000) {
            return dataUrl;
          }
        }
      }
    } catch (err) {
      console.warn('[ScreenCapture] ImageCapture.grabFrame error, using video element fallback:', err);
    }
  }

  // 2. Video element fallback (Firefox, Safari, standard HTML5)
  if (!activeVideoElement) {
    return null;
  }

  try {
    if (activeVideoElement.paused) {
      await activeVideoElement.play().catch(() => {});
    }

    // Wait until video has valid dimensions and readyState >= 2 (HAVE_CURRENT_DATA)
    let retries = 0;
    while ((activeVideoElement.videoWidth === 0 || activeVideoElement.readyState < 2) && retries < 20) {
      await new Promise((r) => setTimeout(r, 100));
      retries++;
    }

    if ('requestVideoFrameCallback' in activeVideoElement) {
      await new Promise<void>((resolve) => {
        (activeVideoElement as any).requestVideoFrameCallback(() => resolve());
        setTimeout(resolve, 300);
      });
    }

    const width = activeVideoElement.videoWidth || 1920;
    const height = activeVideoElement.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Retry loop up to 3 times to ensure the frame is not an unpainted black/blank frame
    for (let attempt = 0; attempt < 3; attempt++) {
      ctx.drawImage(activeVideoElement, 0, 0, width, height);

      // Verify frame has real visual content (not completely pitch black / transparent)
      const sample = ctx.getImageData(Math.floor(width / 2), Math.floor(height / 2), 10, 10).data;
      let hasContent = false;
      for (let i = 0; i < sample.length; i += 4) {
        if (sample[i] > 10 || sample[i + 1] > 10 || sample[i + 2] > 10) {
          hasContent = true;
          break;
        }
      }

      if (hasContent || attempt === 2) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl && dataUrl.length > 1000) {
          return dataUrl;
        }
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return null;
  } catch (err) {
    console.error('[ScreenCapture] Error drawing video frame from active screen stream:', err);
    return null;
  }
}

/**
 * Uploads a genuine screenshot from the employee's own screen to the backend
 * associated with their active running timer.
 */
export async function captureAndUploadActivityScreenshot(params: CaptureParams): Promise<boolean> {
  try {
    if (!isScreenStreamActive()) {
      console.warn('[ScreenCapture] Screen stream is not active. Employee must share screen to capture real workstation activity.');
      return false;
    }

    const imageUrl = await captureUserScreen(params);
    if (!imageUrl) {
      console.warn('[ScreenCapture] No image frame captured from screen video stream.');
      return false;
    }

    const fileSize = Math.round(imageUrl.length * 0.75);

    const res = await fetch('/api/screenshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeEntryId: params.timeEntryId,
        imageUrl,
        fileSize,
        metadata: {
          screenResolution: `${activeVideoElement?.videoWidth || window.innerWidth}x${activeVideoElement?.videoHeight || window.innerHeight}`,
          intervalIndex: typeof params.intervalIndex === 'number' ? params.intervalIndex : Math.floor(params.elapsedSeconds / (params.intervalMinutes * 60)),
          intervalMinute: params.intervalMinutes,
          elapsedSeconds: params.elapsedSeconds,
          projectCode: params.projectCode,
          captureSource: 'DESKTOP_DISPLAY_MEDIA',
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[ScreenCapture] Backend error saving screenshot:', errData);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[ScreenCapture] Failed to capture and upload activity screenshot:', err);
    return false;
  }
}
