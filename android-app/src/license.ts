/**
 * ARAY Android — License System (port dari electron/license.ts)
 *
 * Algoritma sama persis dengan versi Electron:
 *   - machineId = SHA256(hardwareFingerprint)
 *   - activationCode = SHA256(machineId + ":" + licenseType + ":" + expiry + ":" + SECRET)
 *   - License data HMAC-signed, stored di Capacitor Preferences
 *
 * Same LICENSE_SECRET → activation code yang di-generate oleh
 * tools/generate-license.ts berlaku untuk Electron dan Android (asalkan
 * machineId-nya sama).
 *
 * Hardware fingerprint Android (WebView):
 *   navigator.userAgent + navigator.platform + navigator.hardwareConcurrency
 *   + navigator.deviceMemory + screen.width + screen.height + navigator.language
 *   Kombinasi ini stabil di device yang sama, berbeda antar device.
 */

import { Preferences } from '@capacitor/preferences'

const LICENSE_SECRET = 'ARAY-2026-HUMAS-UIN-ANTASARI-BANJARMASIN'
const LICENSE_STORAGE_KEY = 'aray_license_data'
const FIRST_RUN_KEY = 'aray_first_run_date'

export type LicenseType = 'monthly'

export interface LicenseData {
  machineId: string
  activationCode: string
  licenseType: LicenseType
  activatedAt: string
  expiresAt: string
  signature: string
}

export interface LicenseStatus {
  isValid: boolean
  isGracePeriod: boolean
  isExpired: boolean
  daysRemaining: number
  graceDaysRemaining: number
  licenseType: LicenseType | null
  expiresAt: string | null
  machineId: string
  displayMachineId: string
  firstRunDate: string | null
}

// ─── Web Crypto Helpers ──────────────────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey(
    'raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const dataBuf = new TextEncoder().encode(input)
  const sig = await crypto.subtle.sign('HMAC', key, dataBuf)
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Hardware Fingerprint ─────────────────────────────────────────────────
async function getHardwareFingerprint(): Promise<string> {
  const ua = navigator.userAgent || 'unknown-ua'
  const platform = navigator.platform || 'unknown-platform'
  const cpuCores = String(navigator.hardwareConcurrency || 0)
  const mem = String((navigator as any).deviceMemory || 0)
  const screenW = String(screen.width || 0)
  const screenH = String(screen.height || 0)
  const lang = navigator.language || 'unknown-lang'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown-tz'

  const raw = `${ua}|${platform}|${cpuCores}|${mem}|${screenW}x${screenH}|${lang}|${tz}`
  return await sha256Hex(raw)
}

let _cachedMachineId: string | null = null
export async function getMachineId(): Promise<string> {
  if (_cachedMachineId) return _cachedMachineId
  _cachedMachineId = await getHardwareFingerprint()
  return _cachedMachineId
}

export function getDisplayMachineId(machineId: string): string {
  const short = machineId.substring(0, 12).toUpperCase()
  return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`
}

// ─── Activation Code ───────────────────────────────────────────────────────
export async function generateExpectedCode(
  machineId: string,
  licenseType: LicenseType,
  expiresAt: string | null
): Promise<string> {
  const expiryStr = expiresAt ? new Date(expiresAt).getTime().toString(16) : '0'
  const input = `${machineId}:${licenseType}:${expiryStr}:${LICENSE_SECRET}`
  const hash = await sha256Hex(input)
  const code = hash.substring(0, 16).toUpperCase()
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
}

export async function verifyActivationCode(
  machineId: string,
  activationCode: string
): Promise<{ licenseType: LicenseType; expiresAt: string } | null> {
  const normalized = activationCode.replace(/[-\s]/g, '').toUpperCase()
  if (normalized.length !== 16) return null

  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`

  // Cek dari hari ini sampai 45 hari ke depan (sama seperti Electron)
  const now = new Date()
  for (let dayOffset = 0; dayOffset <= 45; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)
    date.setHours(23, 59, 59, 0)
    const monthlyCode = await generateExpectedCode(machineId, 'monthly', date.toISOString())
    if (formatted === monthlyCode) {
      return { licenseType: 'monthly', expiresAt: date.toISOString() }
    }
  }
  return null
}

// ─── License Data Signing ─────────────────────────────────────────────────
async function signLicenseData(data: Omit<LicenseData, 'signature'>): Promise<string> {
  const payload = JSON.stringify({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt,
  })
  return await hmacSha256Hex(LICENSE_SECRET, payload)
}

async function verifyLicenseSignature(data: LicenseData): Promise<boolean> {
  const expectedSig = await signLicenseData({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt,
  })
  if (expectedSig.length !== data.signature.length) return false
  // Constant-time comparison
  let diff = 0
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ data.signature.charCodeAt(i)
  }
  return diff === 0
}

// ─── Storage (Capacitor Preferences) ───────────────────────────────────────
async function readLicenseFile(): Promise<LicenseData | null> {
  try {
    const { value } = await Preferences.get({ key: LICENSE_STORAGE_KEY })
    if (!value) return null
    const data = JSON.parse(value) as LicenseData
    if (!(await verifyLicenseSignature(data))) {
      console.warn('[ARAY LICENSE] Signature invalid — tampering detected')
      return null
    }
    return data
  } catch (e) {
    console.warn('[ARAY LICENSE] Failed to read license:', e)
    return null
  }
}

async function writeLicenseFile(data: LicenseData): Promise<boolean> {
  try {
    await Preferences.set({ key: LICENSE_STORAGE_KEY, value: JSON.stringify(data) })
    return true
  } catch (e) {
    console.error('[ARAY LICENSE] Failed to write license:', e)
    return false
  }
}

async function getFirstRunDate(): Promise<string | null> {
  const { value } = await Preferences.get({ key: FIRST_RUN_KEY })
  return value || null
}

async function recordFirstRun(): Promise<string> {
  const now = new Date().toISOString()
  await Preferences.set({ key: FIRST_RUN_KEY, value: now })
  return now
}

// ─── Public API ────────────────────────────────────────────────────────────
// v4.6.8: Event Session Lock — grace period untuk acara
let _eventSessionStartedAt: string | null = null
const EVENT_GRACE_PERIOD_HOURS = 72

export function startEventSession(): void {
  if (!_eventSessionStartedAt) {
    _eventSessionStartedAt = new Date().toISOString()
    console.log(`[ARAY LICENSE] Event session started at ${_eventSessionStartedAt}`)
    console.log(`[ARAY LICENSE] Grace period active for ${EVENT_GRACE_PERIOD_HOURS}h`)
  }
}

export function isEventSessionActive(): boolean {
  if (!_eventSessionStartedAt) return false
  const elapsed = Date.now() - new Date(_eventSessionStartedAt).getTime()
  return elapsed < EVENT_GRACE_PERIOD_HOURS * 3600 * 1000
}

export async function checkLicenseStatus(): Promise<LicenseStatus> {
  const machineId = await getMachineId()
  const displayMachineId = getDisplayMachineId(machineId)
  const licenseData = await readLicenseFile()

  if (licenseData) {
    const verification = await verifyActivationCode(machineId, licenseData.activationCode)
    if (!verification) {
      return {
        isValid: false, isGracePeriod: false, isExpired: true,
        daysRemaining: 0, graceDaysRemaining: 0, licenseType: null,
        expiresAt: null, machineId, displayMachineId,
        firstRunDate: await getFirstRunDate(),
      }
    }

    const now = new Date()
    const isExpired = licenseData.expiresAt
      ? new Date(licenseData.expiresAt) < now
      : true

    const daysRemaining = licenseData.expiresAt
      ? Math.max(0, Math.ceil((new Date(licenseData.expiresAt).getTime() - now.getTime()) / 86400000))
      : 0

    // v4.6.8: Event Session Lock grace period
    const eventGraceActive = isExpired && isEventSessionActive()
    const graceHoursRemaining = eventGraceActive
      ? Math.ceil((EVENT_GRACE_PERIOD_HOURS * 3600 * 1000 - (Date.now() - new Date(_eventSessionStartedAt!).getTime())) / 3600000)
      : 0

    return {
      isValid: !isExpired || eventGraceActive,
      isGracePeriod: eventGraceActive,
      isExpired: isExpired && !eventGraceActive,
      daysRemaining, graceDaysRemaining: graceHoursRemaining,
      licenseType: licenseData.licenseType,
      expiresAt: licenseData.expiresAt, machineId, displayMachineId,
      firstRunDate: await getFirstRunDate(),
    }
  }

  const firstRunDate = (await getFirstRunDate()) || (await recordFirstRun())
  return {
    isValid: false, isGracePeriod: false, isExpired: true,
    daysRemaining: 0, graceDaysRemaining: 0, licenseType: null,
    expiresAt: null, machineId, displayMachineId, firstRunDate,
  }
}

export async function activateLicense(
  activationCode: string
): Promise<{ success: boolean; error?: string; licenseType?: LicenseType }> {
  const machineId = await getMachineId()
  const verification = await verifyActivationCode(machineId, activationCode)
  if (!verification) {
    return { success: false, error: 'Kode aktivasi tidak valid untuk perangkat ini.' }
  }
  if (new Date(verification.expiresAt) < new Date()) {
    return { success: false, error: 'Kode aktivasi sudah kadaluarsa. Hubungi pengembang untuk kode baru.' }
  }

  const normalized = activationCode.replace(/[-\s]/g, '').toUpperCase()
  const formattedCode = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`

  const licenseData: LicenseData = {
    machineId,
    activationCode: formattedCode,
    licenseType: verification.licenseType,
    activatedAt: new Date().toISOString(),
    expiresAt: verification.expiresAt,
    signature: '',
  }
  licenseData.signature = await signLicenseData(licenseData)

  const written = await writeLicenseFile(licenseData)
  if (!written) {
    return { success: false, error: 'Gagal menyimpan data lisensi.' }
  }
  console.log(`[ARAY LICENSE] Activated: ${verification.licenseType} (expires: ${verification.expiresAt})`)
  return { success: true, licenseType: verification.licenseType }
}

export async function generateLicenseCode(
  machineId: string,
  adminKey: string
): Promise<{
  success: boolean
  error?: string
  data?: {
    machineId: string
    displayMachineId: string
    licenseType: LicenseType
    activationCode: string
    expiresAt: string
    expiresAtFormatted: string
    daysRemaining: number
    verified: boolean
  }
}> {
  const expectedAdminKey = (await sha256Hex(`${LICENSE_SECRET}:admin-api-key`))
    .substring(0, 16).toUpperCase()

  if (adminKey.toUpperCase() !== expectedAdminKey) {
    return { success: false, error: 'Admin key tidak valid. Akses ditolak.' }
  }
  if (!machineId || !/^[a-f0-9]{64}$/i.test(machineId)) {
    return {
      success: false,
      error: `Machine ID tidak valid. Harus 64 karakter hex. Diterima: ${machineId?.length || 0} karakter.`,
    }
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  expiresAt.setHours(23, 59, 59, 0)

  const code = await generateExpectedCode(machineId, 'monthly', expiresAt.toISOString())
  const displayMachineId = getDisplayMachineId(machineId)
  const verification = await verifyActivationCode(machineId, code)

  return {
    success: true,
    data: {
      machineId,
      displayMachineId,
      licenseType: 'monthly',
      activationCode: code,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }),
      daysRemaining: 30,
      verified: verification !== null,
    },
  }
}
