import { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  Save,
  Camera,
  Clock,
  Hash,
  Cloud,
  Shield,
  AlertTriangle,
  HardDrive,
  Share2,
  Link,
  Video,
  Printer,
  SwitchCamera,
  FlipHorizontal
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayProgress } from '../components/ui'
import { useSettingsStore } from '../stores/settings'
import { VIDEO_TEMPLATES } from '../services/video-templates'

export function SettingsPage() {
  const { settings, storageInfo, updateSettings, setStoragePath, loadStorageInfo, loadSettings } = useSettingsStore()
  const [busy, setBusy] = useState(false)

  // v4.7.50: Track discovered USB cameras so they appear in the camera <select> dropdown.
  // BUGFIX: previously, scan + select saved settings.camera_device_id but the dropdown
  // only had Front/Back <option>s — so the user's selection was invisible.
  const [usbCameras, setUsbCameras] = useState<Array<{ id: string; label: string }>>([])
  const [scanning, setScanning] = useState(false)

  const refreshUsbCameras = useCallback(async () => {
    const cap = (window as any).Capacitor
    if (!cap?.Plugins?.UVCCameraNative) return
    try {
      // Ensure USBMonitor registered
      try { await cap.Plugins.UVCCameraNative.initCamera({}) } catch (e) {}
      // Give USB stack a moment to enumerate attached devices
      await new Promise(r => setTimeout(r, 800))
      const result = await cap.Plugins.UVCCameraNative.enumerateCameras()
      const cams: Array<{ id: string; label: string }> = (result.cameras || []).map((c: any) => ({
        id: String(c.id ?? c.deviceName ?? ''),
        label: String(c.label ?? c.id ?? 'USB Camera')
      }))
      setUsbCameras(cams)
      console.log('[Settings] USB cameras refreshed:', cams.length, cams)
    } catch (e) {
      console.warn('[Settings] refreshUsbCameras failed:', e)
    }
  }, [])

  // Auto-enumerate on mount so a previously-selected USB camera re-appears in dropdown
  useEffect(() => {
    if ((window as any).aray?.isAndroid) {
      refreshUsbCameras()
    }
  }, [refreshUsbCameras])

  if (!settings) return null

  const chooseFolder = async () => {
    setBusy(true)
    try {
      // v4.7.5: Android — SAF folder picker untuk pilih folder penyimpanan LOKAL
      if ((window as any).aray?.isAndroid) {
        const result = await window.aray.storage.chooseFolder()
        const data: any = (result as any).data || result
        if (data && !data.canceled && data.path) {
          alert('Folder penyimpanan lokal berhasil dipilih!\n\nFoto akan disimpan di folder ini.\n\nUntuk auto-upload ke Google Drive, buka Sync Center → Connect.')
          await loadStorageInfo()
          await loadSettings()
        } else if (data?.canceled) {
          // User cancel — silent
        }
        return
      }
      // Electron — pakai native dialog
      const result = await window.aray.storage.chooseFolder()
      const data: any = (result as any).data || result
      if (data && !data.canceled && data.path) {
        await setStoragePath(data.path)
      }
    } catch (e: any) {
      alert('Gagal memilih folder: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-padding space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Settings</h1>
        <p className="text-silver-400 text-sm">
          Configure ARAY your way. <span className="italic">One more?</span>
        </p>
      </div>

      {/* Storage */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-purple-haze-300" />
          <h3 className="font-semibold">Local Storage</h3>
        </div>
        <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-4 mb-4">
          <div className="text-xs text-silver-500 uppercase tracking-wide mb-1">Storage path</div>
          <div className="font-mono text-purple-haze-100 break-all">{settings.storage_path}</div>
        </div>
        {storageInfo && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-silver-300">
                {formatBytes(storageInfo.free_bytes)} free of {formatBytes(storageInfo.total_bytes)}
              </span>
              <ArayBadge variant={storageInfo.critical ? 'danger' : storageInfo.warning ? 'warning' : 'success'}>
                {storageInfo.critical ? 'Critical' : storageInfo.warning ? 'Warning' : 'Healthy'}
              </ArayBadge>
            </div>
            <ArayProgress
              value={storageInfo.used_percent}
              variant={storageInfo.critical ? 'gold' : 'purple'}
            />
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          {/* v4.7.3: Android — "Change folder" sekarang ACTUALLY works via SAF picker.
              User tap → system folder picker → pilih folder Google Drive →
              URI persisted → auto-upload aktif. */}
          <ArayButton variant="silver" icon={<Folder className="w-4 h-4" />} onClick={chooseFolder} loading={busy}>
            Change folder
          </ArayButton>
          <ArayButton variant="ghost" onClick={loadStorageInfo}>
            Refresh
          </ArayButton>
          {(window as any).aray?.isAndroid && (
            <ArayButton variant="gold" icon={<Folder className="w-4 h-4" />} onClick={async () => {
              const result = await window.aray.storage.openFolder()
              if (!result.success) {
                alert('Tidak bisa membuka folder otomatis. Manual: buka app Files → Documents → ARAY')
              }
            }}>
              Open in Files app
            </ArayButton>
          )}
        </div>

        {/* v4.7.0: Android info card — explain storage location */}
        {(window as any).aray?.isAndroid && (
          <div className="mt-4 p-3 rounded-xl bg-purple-haze-500/10 border border-purple-haze-500/30 text-sm">
            <p className="text-purple-haze-100 font-medium mb-1">Penyimpanan Android</p>
            <p className="text-silver-400 text-xs leading-relaxed">
              Foto disimpan di <code className="text-gold-300">Internal Storage → Documents → ARAY</code>.
              Folder ini <strong>publik</strong> — bisa diakses via app "Files" atau "File Manager" bawaan Android.
              Untuk backup: tap "Open in Files app", lalu select all → share ke Google Drive, WhatsApp, atau copy ke PC.
            </p>
          </div>
        )}
      </ArayCard>

      {/* ─── PHOTO SETTINGS ─── */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-gold-300" />
          <h3 className="font-semibold">Photo Booth Settings</h3>
        </div>
        <div className="space-y-4">
          {/* v4.7.46: Camera selector — Front, Back, + USB cameras via Camera2Native */}
          <SettingRow
            icon={<SwitchCamera className="w-4 h-4" />}
            label="Camera"
            hint="Front, back, atau USB capture card"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[280px]"
              value={settings.camera_device_id || settings.camera_facing || 'user'}
              onChange={async (e) => {
                const val = e.target.value
                if (val === 'user' || val === 'environment') {
                  // Built-in camera
                  await updateSettings({
                    camera_device_id: null,
                    camera_facing: val,
                    camera_mirror: val === 'user'
                  })
                  // Close Camera2Native / UVC jika sedang open
                  const cap = (window as any).Capacitor
                  if (cap?.Plugins?.Camera2Native) {
                    try { await cap.Plugins.Camera2Native.closeCamera() } catch(e) {}
                  }
                  if (cap?.Plugins?.UVCCameraNative) {
                    try { await cap.Plugins.UVCCameraNative.closeCamera() } catch(e) {}
                  }
                } else {
                  // USB/External camera — simpan device_id
                  await updateSettings({
                    camera_device_id: val,
                    camera_facing: 'environment',
                    camera_mirror: false
                  })
                  // v4.7.47: Init + open UVC camera jika plugin tersedia
                  const cap2 = (window as any).Capacitor
                  if (cap2?.Plugins?.UVCCameraNative) {
                    try {
                      await cap2.Plugins.UVCCameraNative.initCamera({})
                      await cap2.Plugins.UVCCameraNative.openCamera({ deviceName: val })
                      console.log('[Settings] UVC camera opened:', val)
                    } catch(e) {
                      console.warn('[Settings] UVC open failed, trying Camera2Native:', e)
                      if (cap2?.Plugins?.Camera2Native) {
                        try { await cap2.Plugins.Camera2Native.openCamera({ cameraId: val }) } catch(e2) {}
                      }
                    }
                  } else if (cap2?.Plugins?.Camera2Native) {
                    try { await cap2.Plugins.Camera2Native.openCamera({ cameraId: val }) } catch(e) {}
                  }
                }
              }}
            >
              <option value="user">Front Camera (selfie)</option>
              <option value="environment">Back Camera</option>
              {/* v4.7.50: Render USB cameras discovered via Scan button.
                  BUGFIX: previously these <option>s were missing, so the
                  user's selection was invisible in the dropdown. */}
              {usbCameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label}
                </option>
              ))}
              {/* Fallback: jika camera_device_id diset tapi tidak ada di usbCameras list
                  (misalnya page reload, atau USB device belum di-enumerate),
                  tetap tampilkan sebagai option supaya dropdown tidak kosong. */}
              {settings.camera_device_id &&
               !usbCameras.some((c) => c.id === settings.camera_device_id) && (
                <option value={settings.camera_device_id}>
                  USB Camera (terpilih)
                </option>
              )}
            </select>
          </SettingRow>

          {/* v4.7.49: USB Camera — SettingRow terpisah, jelas terlihat */}
          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="USB Capture Card"
            hint="Untuk DSLR via capture card (USB OTG). Setelah scan, pilih kamera di dropdown Camera di atas."
          >
            <button
              onClick={async () => {
                const cap = (window as any).Capacitor
                if (!cap?.Plugins?.UVCCameraNative) {
                  alert('UVC plugin tidak tersedia di perangkat ini.')
                  return
                }
                setScanning(true)
                try {
                  await cap.Plugins.UVCCameraNative.initCamera({})
                  await new Promise(r => setTimeout(r, 2000))
                  const result = await cap.Plugins.UVCCameraNative.enumerateCameras()
                  const cams: Array<{ id: string; label: string }> = (result.cameras || []).map((c: any) => ({
                    id: String(c.id ?? c.deviceName ?? ''),
                    label: String(c.label ?? c.id ?? 'USB Camera')
                  }))
                  console.log('[Settings] UVC cameras found:', cams.length, cams)

                  // v4.7.50: Update state supaya dropdown langsung menampilkan USB cameras
                  setUsbCameras(cams)

                  if (cams.length > 0) {
                    const labels = cams.map((c, i) => `${i + 1}. ${c.label}`).join('\n')
                    const choice = prompt(`Ditemukan ${cams.length} USB camera:\n\n${labels}\n\nKetik nomor (1-${cams.length}):`)
                    if (choice) {
                      const idx = parseInt(choice) - 1
                      if (idx >= 0 && idx < cams.length) {
                        const cam = cams[idx]
                        // v4.7.50: Tunggu refresh state selesai sebelum simpan settings,
                        // supaya render berikutnya dropdown sudah punya option untuk cam.id ini.
                        await updateSettings({
                          camera_device_id: cam.id,
                          camera_facing: 'environment',
                          camera_mirror: false
                        })
                        try {
                          await cap.Plugins.UVCCameraNative.openCamera({ deviceName: cam.id })
                        } catch (e) {
                          console.warn('[Settings] openCamera failed (will retry on Booth):', e)
                        }
                        alert(
                          `USB camera dipilih: ${cam.label}\n\n` +
                          `Pilihan tersimpan. Dropdown "Camera" di atas sekarang menampilkan kamera ini.\n` +
                          `Buka tab Booth untuk mulai menggunakannya.`
                        )
                      } else {
                        alert('Nomor tidak valid. Tidak ada kamera yang dipilih.')
                      }
                    }
                  } else {
                    alert('Tidak ada USB camera ditemukan.\n\nPastikan:\n1. Capture card terhubung via OTG\n2. Kamera DSLR menyala\n3. Capture card terdeteksi Android')
                  }
                } catch (e: any) {
                  alert('Error: ' + (e?.message || e))
                } finally {
                  setScanning(false)
                }
              }}
              disabled={scanning}
              className="aray-btn-gold w-full text-sm"
            >
              {scanning ? 'Scanning...' : 'Scan & Pilih USB Camera'}
            </button>
            {/* v4.7.50: Tampilkan info camera USB yang sedang terdeteksi */}
            {usbCameras.length > 0 && (
              <div className="text-xs text-silver-400 mt-2 leading-relaxed">
                Terdeteksi: {usbCameras.map((c) => c.label).join(', ')}
              </div>
            )}
            {settings.camera_device_id && (
              <div className="text-xs text-gold-300 mt-1">
                Aktif: {usbCameras.find((c) => c.id === settings.camera_device_id)?.label || settings.camera_device_id}
              </div>
            )}
          </SettingRow>

          <SettingRow
            icon={<FlipHorizontal className="w-4 h-4" />}
            label="Mirror preview"
            hint="Flip camera horizontally (natural for front cam)"
          >
            <Toggle
              value={settings.camera_mirror ?? true}
              onChange={(v) => updateSettings({ camera_mirror: v })}
            />
          </SettingRow>

          {/* v4.7.7: Photo quality preset — control file size */}
          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Photo quality"
            hint="Resolution + compression. Lower = smaller file, more storage hemat"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[280px]"
              value={settings.photo_quality ?? 'high'}
              onChange={(e) => updateSettings({ photo_quality: e.target.value as 'small' | 'medium' | 'high' | 'original' })}
            >
              <option value="small">Small (640×480, ~80KB/foto, ~320KB/composite)</option>
              <option value="medium">Medium (1280×720, ~250KB/foto, ~1MB/composite)</option>
              <option value="high">High (1920×1080, ~500KB/foto, ~2MB/composite)</option>
              <option value="original">Original (native res, ~1MB/foto, ~4MB/composite)</option>
            </select>
          </SettingRow>

          {/* v4.7.7: Storage estimate untuk 5000 peserta */}
          <div className="p-3 rounded-xl bg-purple-haze-500/10 border border-purple-haze-500/20 text-xs">
            <p className="text-purple-haze-100 font-medium mb-1">Estimasi storage untuk 5000 peserta (4 foto/sesi):</p>
            <p className="text-silver-400">
              Small: ~1.6GB · Medium: ~5GB · High: ~10GB · Original: ~20GB
            </p>
            <p className="text-silver-500 mt-1">
              Kualitas saat ini: <strong className="text-gold-300">
                {(() => {
                  const q = settings.photo_quality ?? 'high'
                  const labels: Record<string,string> = {
                    small: 'Small (~80KB/foto)',
                    medium: 'Medium (~250KB/foto)',
                    high: 'High (~500KB/foto)',
                    original: 'Original (~1MB/foto)'
                  }
                  return labels[q] || labels.high
                })()}
              </strong>
            </p>
          </div>

          <SettingRow
            icon={<Hash className="w-4 h-4" />}
            label="Number of shots"
            hint="How many photos per session"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[120px]"
              value={settings.booth_shot_count}
              onChange={(e) => updateSettings({ booth_shot_count: parseInt(e.target.value, 10) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Photo aspect ratio"
            hint="Output dimensions for photos"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[120px]"
              value={settings.aspect_ratio || '9:16'}
              onChange={(e) => updateSettings({ aspect_ratio: e.target.value })}
            >
              <option value="9:16">9:16 (Portrait)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="4:3">4:3 (Classic)</option>
              <option value="16:9">16:9 (Landscape)</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Photo camera effect"
            hint="Cinematic filter applied to photos"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[200px]"
              value={settings.camera_effect || 'original'}
              onChange={(e) => updateSettings({ camera_effect: e.target.value })}
            >
              <option value="original">Original</option>
              <option value="purple-haze">Purple Haze</option>
              <option value="vintage">Vintage</option>
              <option value="noir">Noir B&W</option>
              <option value="cool-blue">Cool Blue</option>
              <option value="warm-sunset">Warm Sunset</option>
              <option value="cinematic">Cinematic</option>
              <option value="vintage-film">Vintage Film</option>
              <option value="neon-pulse">Neon Pulse</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Save className="w-4 h-4" />}
            label="Auto-print after capture"
            hint="Send every capture straight to the printer"
          >
            <Toggle value={settings.auto_print} onChange={(v) => updateSettings({ auto_print: v })} />
          </SettingRow>
        </div>
      </ArayCard>

      {/* ─── VIDEO SETTINGS ─── */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Video className="w-5 h-5 text-purple-haze-300" />
          <h3 className="font-semibold">Video Booth Settings</h3>
        </div>
        <div className="space-y-4">
          <SettingRow
            icon={<Video className="w-4 h-4" />}
            label="Video template"
            hint="Motion effect for video booth recordings"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[300px]"
              value={settings.video_template || 'viral-bounce-10'}
              onChange={(e) => updateSettings({ video_template: e.target.value })}
            >
              {VIDEO_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.description} ({t.duration}s)
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Video aspect ratio"
            hint="Output dimensions for videos"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[120px]"
              value={settings.aspect_ratio_video || settings.aspect_ratio || '9:16'}
              onChange={(e) => updateSettings({ aspect_ratio_video: e.target.value })}
            >
              <option value="9:16">9:16 (Portrait)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="4:3">4:3 (Classic)</option>
              <option value="16:9">16:9 (Landscape)</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Video className="w-4 h-4" />}
            label="Video camera effect"
            hint="Cinematic filter applied to videos"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[200px]"
              value={settings.camera_effect_video || settings.camera_effect || 'original'}
              onChange={(e) => updateSettings({ camera_effect_video: e.target.value })}
            >
              <option value="original">Original</option>
              <option value="purple-haze">Purple Haze</option>
              <option value="vintage">Vintage</option>
              <option value="noir">Noir B&W</option>
              <option value="cool-blue">Cool Blue</option>
              <option value="warm-sunset">Warm Sunset</option>
              <option value="cinematic">Cinematic</option>
              <option value="vintage-film">Vintage Film</option>
              <option value="neon-pulse">Neon Pulse</option>
            </select>
          </SettingRow>
        </div>
      </ArayCard>

      {/* ─── SHARED SETTINGS ─── */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-silver-300" />
          <h3 className="font-semibold">Shared Settings</h3>
        </div>
        <div className="space-y-4">
          {/* v4.6.4: Booth mode — Photo only, Video only, or Combined */}
          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Booth mode"
            hint="Photo only = khusus foto. Video only = khusus video. Combined = user pilih di booth."
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[180px]"
              value={settings.booth_mode || 'combined'}
              onChange={(e) => updateSettings({ booth_mode: e.target.value as any })}
            >
              <option value="combined">Combined (Photo + Video)</option>
              <option value="photo">Photo Only</option>
              <option value="video">Video Only</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Clock className="w-4 h-4" />}
            label="Countdown seconds"
            hint="Delay before each capture (photo & video)"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[120px]"
              value={settings.booth_countdown_seconds}
              onChange={(e) => updateSettings({ booth_countdown_seconds: parseInt(e.target.value, 10) })}
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Palm trigger (hands-free)"
            hint="Angkat telapak tangan ke kamera untuk capture otomatis"
          >
            <Toggle
              value={settings.palm_trigger || false}
              onChange={(v) => updateSettings({ palm_trigger: v })}
            />
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Palm trigger sensitivity"
            hint="Semakin tinggi = semakin mudah mendeteksi telapak tangan"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[160px]"
              value={settings.palm_trigger_sensitivity || 0.6}
              onChange={(e) => updateSettings({ palm_trigger_sensitivity: parseFloat(e.target.value) })}
              disabled={!settings.palm_trigger}
            >
              <option value={0.4}>Low (jarang trigger)</option>
              <option value={0.6}>Medium (seimbang)</option>
              <option value={0.8}>High (mudah trigger)</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Shield className="w-4 h-4" />}
            label="Fullscreen booth password"
            hint="Password untuk keluar dari mode fullscreen booth. Kosongkan untuk tanpa password."
          >
            <input
              type="text"
              className="aray-input w-full sm:w-auto sm:max-w-[200px]"
              value={settings.booth_fullscreen_password ?? 'aray'}
              onChange={(e) => updateSettings({ booth_fullscreen_password: e.target.value })}
              placeholder="aray"
              autoComplete="off"
            />
          </SettingRow>

          <SettingRow
            icon={<Share2 className="w-4 h-4" />}
            label="Enable Share button (QR code)"
            hint="Tampilkan tombol Share di result screen. Klik -> popup QR code dari link di bawah."
          >
            <Toggle
              value={settings.share_qr_enabled || false}
              onChange={(v) => updateSettings({ share_qr_enabled: v })}
            />
          </SettingRow>

          <SettingRow
            icon={<Link className="w-4 h-4" />}
            label="Share QR link"
            hint="URL yang akan di-encode ke QR code. Mis. Google Drive folder atau website gallery."
          >
            <input
              type="url"
              className="aray-input w-full sm:w-auto sm:max-w-[280px]"
              value={settings.share_qr_link || ''}
              onChange={(e) => updateSettings({ share_qr_link: e.target.value })}
              disabled={!settings.share_qr_enabled}
              placeholder="https://drive.google.com/..."
              autoComplete="off"
            />
          </SettingRow>

          {/* v4.6.3: Toggle Print & Share buttons visibility */}
          <SettingRow
            icon={<Printer className="w-4 h-4" />}
            label="Show Print button"
            hint="Tampilkan tombol Print di result screen booth"
          >
            <Toggle
              value={settings.show_print_button !== false}
              onChange={(v) => updateSettings({ show_print_button: v })}
            />
          </SettingRow>

          <SettingRow
            icon={<Share2 className="w-4 h-4" />}
            label="Show Share button"
            hint="Tampilkan tombol Share di result screen booth"
          >
            <Toggle
              value={settings.show_share_button !== false}
              onChange={(v) => updateSettings({ show_share_button: v })}
            />
          </SettingRow>
        </div>
      </ArayCard>
      <ArayCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-purple-haze-300" />
            <h3 className="font-semibold">Google Drive</h3>
          </div>
          {/* v4.4.5: Connect/Disconnect button di Settings page */}
          {!settings.google_drive_connected ? (
            <ArayButton variant="silver" onClick={async () => {
              await window.aray.googleDrive.connect()
              // v4.4.9 FIX: Always refresh — sebelumnya pakai if(result?.connected) yang bug
              await loadSettings()
            }}>
              Connect
            </ArayButton>
          ) : (
            <ArayButton variant="ghost" onClick={async () => {
              await window.aray.googleDrive.disconnect()
              await loadSettings()
            }}>
              Disconnect
            </ArayButton>
          )}
        </div>
        {settings.google_drive_connected && settings.backup_folder && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-300">
            <strong>Connected:</strong> {settings.backup_folder}
          </div>
        )}
        <div className="space-y-4">
          <SettingRow
            icon={<Cloud className="w-4 h-4" />}
            label="Auto-sync to Google Drive"
            hint="Otomatis backup setiap capture ke Google Drive folder"
          >
            <Toggle
              value={settings.auto_backup || false}
              onChange={(v) => updateSettings({ auto_backup: v, auto_sync: v })}
              disabled={!settings.google_drive_connected}
            />
          </SettingRow>

          <SettingRow
            icon={<Clock className="w-4 h-4" />}
            label="Sync interval"
            hint="How often pending files upload"
          >
            <select
              className="aray-input w-full sm:w-auto sm:max-w-[180px]"
              value={settings.sync_interval}
              onChange={(e) => updateSettings({ sync_interval: e.target.value as any })}
              disabled={!settings.google_drive_connected}
            >
              <option value="immediately">Immediately</option>
              <option value="30s">Every 30 seconds</option>
              <option value="1m">Every 1 minute</option>
              <option value="5m">Every 5 minutes</option>
              <option value="event_end">When event ends</option>
              <option value="manual">Manual only</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Delete local after sync"
            hint="Free up disk space after cloud upload verified"
            danger
          >
            <Toggle
              value={settings.delete_local_after_sync}
              onChange={(v) => {
                if (v && !confirm('Are you sure? ARAY will delete local files only after verifying the cloud copy. This cannot be undone per file.')) {
                  return
                }
                updateSettings({ delete_local_after_sync: v })
              }}
              disabled={!settings.google_drive_connected}
            />
          </SettingRow>
        </div>
        {!settings.google_drive_connected && (
          <p className="text-xs text-silver-500 mt-4 italic">
            Connect Google Drive first to enable cloud sync features. (OAuth arrives in Phase 3.)
          </p>
        )}
      </ArayCard>

      {/* Kiosk */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gold-300" />
          <h3 className="font-semibold">Kiosk Mode</h3>
        </div>
        <SettingRow
          icon={<Shield className="w-4 h-4" />}
          label="Enable kiosk mode"
          hint="Full-screen booth. Hides settings & sidebar. Auto-redirect ke Booth page."
          danger
        >
          <Toggle
            value={settings.kiosk_mode}
            onChange={(v) => updateSettings({ kiosk_mode: v })}
          />
        </SettingRow>
        <div className="mt-4 p-3 rounded-lg bg-purple-haze-500/10 border border-purple-haze-500/20 text-xs text-silver-300 space-y-1">
          <p><strong className="text-silver-200">Cara exit kiosk mode:</strong></p>
          <p>1. Klik tombol X kecil di pojok kanan atas → masukkan password</p>
          <p>2. Atau tekan shortcut keyboard:</p>
          <p className="pl-4 font-mono text-purple-haze-200">Ctrl+Shift+Alt+Q</p>
          <p className="pl-4 font-mono text-purple-haze-200">Ctrl+Shift+Q (backup)</p>
          <p className="mt-2"><strong className="text-silver-200">Password:</strong> {settings.booth_fullscreen_password || 'aray'} (ubah di Camera Settings)</p>
        </div>
      </ArayCard>

      <div className="text-center py-4">
        <p className="text-xs text-silver-600">
          ARAY v1.0.0 — <span className="italic">Yap. Snap. Repeat.</span>
        </p>
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  label,
  hint,
  children,
  danger
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3">
      <div className="flex items-start gap-3">
        <div className={`${danger ? 'text-yellow-300' : 'text-silver-400'} mt-0.5`}>{icon}</div>
        <div>
          <div className="text-sm font-medium text-silver-100">{label}</div>
          {hint && <div className="text-xs text-silver-500 mt-0.5">{hint}</div>}
        </div>
      </div>
      <div className="w-full sm:w-auto sm:max-w-[320px]">{children}</div>
    </div>
  )
}

function Toggle({
  value,
  onChange,
  disabled
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        value ? 'bg-purple-haze-500' : 'bg-silver-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : ''
        }`}
      />
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
