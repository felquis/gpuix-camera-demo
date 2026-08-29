import { useState, useEffect } from 'react'
import { render } from '@gpuix/react'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

// Bundled binary lives next to the executable in the .app; fall back to Homebrew
const FFMPEG =
  [join(dirname(process.execPath), 'ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
    .find((p) => existsSync(p)) ?? null

const TMP = tmpdir()
// Each frame gets a unique path so GPUI's path-based image cache never returns a stale frame
const framePath = (idx: number) => join(TMP, `cheesecake-cam-${idx}.jpg`)

async function startCamera(
  onFrame: (path: string) => void,
  onError: (msg: string) => void,
  signal: AbortSignal,
) {
  if (!FFMPEG) {
    onError('ffmpeg not found — install with: brew install ffmpeg')
    return
  }

  const proc = Bun.spawn(
    [
      FFMPEG, '-hide_banner',
      '-f', 'avfoundation',
      '-framerate', '30',
      '-video_size', '1280x720',
      '-i', '0',
      '-an',
      '-vf', 'scale=640:360',
      '-f', 'mjpeg',
      '-q:v', '6',
      'pipe:1',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )

  signal.addEventListener('abort', () => proc.kill())

  // Drain stderr and surface the first error line if capture fails
  ;(async () => {
    const errReader = proc.stderr.getReader()
    let errText = ''
    while (true) {
      const { done, value } = await errReader.read()
      if (done) break
      errText += new TextDecoder().decode(value)
    }
    const match = errText.match(/Error[^\n]+/i)
    if (match) onError(match[0])
  })()

  const reader = proc.stdout.getReader()
  let buf = new Uint8Array(0)
  let idx = 0

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      const merged = new Uint8Array(buf.length + value.length)
      merged.set(buf)
      merged.set(value, buf.length)
      buf = merged

      // Extract complete JPEG frames (SOI = 0xFF 0xD8, EOI = 0xFF 0xD9)
      let offset = 0
      while (offset < buf.length - 1) {
        let soi = -1
        for (let i = offset; i < buf.length - 1; i++) {
          if (buf[i] === 0xFF && buf[i + 1] === 0xD8) { soi = i; break }
        }
        if (soi === -1) break

        let eoi = -1
        for (let i = soi + 2; i < buf.length - 1; i++) {
          if (buf[i] === 0xFF && buf[i + 1] === 0xD9) { eoi = i + 2; break }
        }
        if (eoi === -1) { offset = soi; break }

        const path = framePath(idx)
        await Bun.write(path, buf.slice(soi, eoi))
        onFrame(path)
        // Clean up frames from 5 iterations ago to bound disk usage (fire-and-forget)
        if (idx >= 5) unlink(framePath(idx - 5)).catch(() => {})
        idx++
        offset = eoi
      }
      buf = buf.slice(offset)
    }
  } catch (e) {
    onError(String(e))
  } finally {
    reader.releaseLock()
  }
}

function LiveDot() {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 800)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? '#ef4444' : 'transparent' }} />
  )
}

function App() {
  const [frame, setFrame] = useState<string | null>(null)
  const [frameCount, setFrameCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    startCamera(
      (path) => { setFrame(path); setFrameCount((c) => c + 1) },
      setError,
      controller.signal,
    )
    return () => controller.abort()
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#000', position: 'relative' }}>

      {/* Camera feed — unique src path per frame keeps the element alive with no black flash */}
      {frame && (
        <img
          src={frame}
          objectFit="cover"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        />
      )}

      {/* Loading / error state */}
      {!frame && (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <text style={{ color: error ? '#ef4444' : '#555', fontSize: 15 }}>
            {error ?? 'Starting camera…'}
          </text>
        </div>
      )}

      {/* Bottom overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingTop: 18, paddingBottom: 18, paddingLeft: 28, paddingRight: 28,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <text style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Cheesecake Lovers</text>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiveDot />
          <text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>LIVE</text>
        </div>
      </div>

    </div>
  )
}

render(<App />, {
  title: 'Cheesecake Lovers',
  appName: 'Cheesecake Lovers',
  width: 1280,
  height: 720,
  titlebarTransparent: true,
  windowBackground: 'blurred',
  trafficLightX: 16,
  trafficLightY: 17,
})
