/**
 * ARAY — License System (Level 1: Offline Activation)
 *
 * Adaptasi dari Saatiril-Andro license system.
 *
 * How it works:
 * 1. On first launch, generate a Machine ID from hardware fingerprint
 * 2. Display Machine ID to user → they send it to us
 * 3. We run the generator tool → produce an Activation Code
 * 4. User enters the code → app verifies it matches the Machine ID
 * 5. If valid, store signed license data locally
 * 6. On subsequent launches, verify the stored license
 *
 * Security:
 * - Machine ID = SHA256(cpuInfo + macAddress + hostname + platform + arch)
 * - Activation Code = SHA256(machineId + ":" + licenseType + ":" + expiry + ":" + SECRET)
 * - License data is HMAC-signed to prevent tampering
 * - No grace period — activation required immediately
 * - Monthly license only — every code valid for 30 days, then must request new code
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'

// ─── Configuration ─────────────────────────────────────────────────────────
const GRACE_PERIOD_DAYS = 0 // No grace period — activation required immediately

// IMPORTANT: Same secret must be used in tools/generate-license.ts
const LICENSE_SECRET = 'ARAY-2026-HUMAS-UIN-ANTASARI-BANJARMASIN'

// ─── Types ─────────────────────────────────────────────────────────────────
export type LicenseType = 'monthly'

export interface LicenseData {
  machineId: string
  activationCode: string
  licenseType: LicenseType
  activatedAt: string    // ISO date
  expiresAt: string      // ISO date — always present for monthly license
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
  displayMachineId: string // Shortened for display
  firstRunDate: string | null
}

// ─── Machine ID Generation ─────────────────────────────────────────────────
function getHardwareFingerprint(): string {
  const cpus = os.cpus()
  const cpuInfo = cpus.length > 0 ? cpus[0].model : 'unknown-cpu'
  const cpuCores = String(cpus.length)

  const nets = os.networkInterfaces()
  let macAddress = 'no-mac'
  for (const [, addrs] of Object.entries(nets)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (!addr.internal && addr.family === 'IPv4' && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macAddress = addr.mac
        break
      }
    }
    if (macAddress !== 'no-mac') break
  }

  const hostname = os.hostname()
  const platform = os.platform()
  const arch = os.arch()

  const raw = `${cpuInfo}|${cpuCores}|${macAddress}|${hostname}|${platform}|${arch}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function getMachineId(): string {
  return getHardwareFingerprint()
}

export function getDisplayMachineId(machineId: string): string {
  const short = machineId.substring(0, 12).toUpperCase()
  return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`
}

// ─── Activation Code Verification ──────────────────────────────────────────
export function generateExpectedCode(
  machineId: string,
  licenseType: LicenseType,
  expiresAt: string | null
): string {
  const expiryStr = expiresAt ? new Date(expiresAt).getTime().toString(16) : '0'
  const input = `${machineId}:${licenseType}:${expiryStr}:${LICENSE_SECRET}`
  const hash = crypto.createHash('sha256').update(input).digest('hex')
  const code = hash.substring(0, 16).toUpperCase()
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
}

export function verifyActivationCode(
  machineId: string,
  activationCode: string
): { licenseType: LicenseType; expiresAt: string } | null {
  const normalized = activationCode.replace(/[-\s]/g, '').toUpperCase()
  if (normalized.length !== 16) return null

  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`

  // Check dates from today up to 45 days ahead
  const now = new Date()
  for (let dayOffset = 0; dayOffset <= 45; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)
    date.setHours(23, 59, 59, 0)
    const monthlyCode = generateExpectedCode(machineId, 'monthly', date.toISOString())
    if (formatted === monthlyCode) {
      return { licenseType: 'monthly', expiresAt: date.toISOString() }
    }
  }

  return null
}

// ─── License Data Signing & Verification ───────────────────────────────────
function signLicenseData(data: Omit<LicenseData, 'signature'>): string {
  const payload = JSON.stringify({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt,
  })
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex')
}

function verifyLicenseSignature(data: LicenseData): boolean {
  const expectedSig = signLicenseData({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt,
  })
  try {
    return crypto.timingSafeEqual(
      Buffer.from(data.signature, 'hex'),
      Buffer.from(expectedSig, 'hex')
    )
  } catch {
    return false
  }
}

// ─── Encryption ────────────────────────────────────────────────────────────
function getEncryptionKey(): { key: Buffer; iv: Buffer } {
  const key = crypto.createHash('sha256').update(LICENSE_SECRET).digest()
  const iv = Buffer.alloc(16, 0)
  return { key, iv }
}

function encryptData(plaintext: string): string {
  const { key, iv } = getEncryptionKey()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(plaintext, 'utf-8', 'base64')
  encrypted += cipher.final('base64')
  return encrypted
}

function decryptData(ciphertext: string): string {
  const { key, iv } = getEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(ciphertext, 'base64', 'utf-8')
  decrypted += decipher.final('utf-8')
  return decrypted
}

// ─── License File Storage ──────────────────────────────────────────────────
function getLicenseFilePath(): string {
  return path.join(app.getPath('userData'), 'license.dat')
}

function getFirstRunFilePath(): string {
  return path.join(app.getPath('userData'), 'first-run.dat')
}

export function readLicenseFile(): LicenseData | null {
  try {
    const filePath = getLicenseFilePath()
    if (!fs.existsSync(filePath)) return null

    const encrypted = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(decryptData(encrypted)) as LicenseData

    if (!verifyLicenseSignature(data)) {
      console.warn('[ARAY LICENSE] License file signature invalid — tampering detected')
      return null
    }

    return data
  } catch (e) {
    console.warn('[ARAY LICENSE] Failed to read license file:', e)
    return null
  }
}

function writeLicenseFile(data: LicenseData): boolean {
  try {
    const filePath = getLicenseFilePath()
    const json = JSON.stringify(data)
    const encrypted = encryptData(json)
    fs.writeFileSync(filePath, encrypted, 'utf-8')
    return true
  } catch (e) {
    console.error('[ARAY LICENSE] Failed to write license file:', e)
    return false
  }
}

function getFirstRunDate(): string | null {
  try {
    const filePath = getFirstRunFilePath()
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return null
  }
}

function recordFirstRun(): string {
  try {
    const filePath = getFirstRunFilePath()
    const now = new Date().toISOString()
    fs.writeFileSync(filePath, now, 'utf-8')
    return now
  } catch {
    return new Date().toISOString()
  }
}

// ─── License Status Check ──────────────────────────────────────────────────
export function checkLicenseStatus(): LicenseStatus {
  const machineId = getMachineId()
  const displayMachineId = getDisplayMachineId(machineId)

  const licenseData = readLicenseFile()

  if (licenseData) {
    const verification = verifyActivationCode(machineId, licenseData.activationCode)
    if (!verification) {
      return {
        isValid: false,
        isGracePeriod: false,
        isExpired: true,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        licenseType: null,
        expiresAt: null,
        machineId,
        displayMachineId,
        firstRunDate: getFirstRunDate(),
      }
    }

    const now = new Date()
    const isExpired = licenseData.expiresAt
      ? new Date(licenseData.expiresAt) < now
      : true

    const daysRemaining = licenseData.expiresAt
      ? Math.max(0, Math.ceil((new Date(licenseData.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    return {
      isValid: !isExpired,
      isGracePeriod: false,
      isExpired,
      daysRemaining,
      graceDaysRemaining: 0,
      licenseType: licenseData.licenseType,
      expiresAt: licenseData.expiresAt,
      machineId,
      displayMachineId,
      firstRunDate: getFirstRunDate(),
    }
  }

  const firstRunDate = getFirstRunDate() || recordFirstRun()

  return {
    isValid: false,
    isGracePeriod: false,
    isExpired: true,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    licenseType: null,
    expiresAt: null,
    machineId,
    displayMachineId,
    firstRunDate,
  }
}

// ─── Activate License ──────────────────────────────────────────────────────
export function activateLicense(activationCode: string): { success: boolean; error?: string; licenseType?: LicenseType } {
  const machineId = getMachineId()

  const verification = verifyActivationCode(machineId, activationCode)
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

  licenseData.signature = signLicenseData(licenseData)

  const written = writeLicenseFile(licenseData)
  if (!written) {
    return { success: false, error: 'Gagal menyimpan data lisensi ke disk.' }
  }

  console.log(`[ARAY LICENSE] Activated: ${verification.licenseType} (expires: ${verification.expiresAt})`)
  return { success: true, licenseType: verification.licenseType }
}

// ─── Generate License Code (for admin/developer use) ───────────────────────
export function generateLicenseCode(
  machineId: string,
  adminKey: string
): {
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
} {
  const expectedAdminKey = crypto
    .createHash('sha256')
    .update(`${LICENSE_SECRET}:admin-api-key`)
    .digest('hex')

  if (adminKey !== expectedAdminKey) {
    return { success: false, error: 'Admin key tidak valid.' }
  }

  // Monthly license — expires 30 days from now
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  expiresAt.setHours(23, 59, 59, 0)

  const code = generateExpectedCode(machineId, 'monthly', expiresAt.toISOString())
  const displayMachineId = getDisplayMachineId(machineId)

  // Verify the code
  const verification = verifyActivationCode(machineId, code)

  return {
    success: true,
    data: {
      machineId,
      displayMachineId,
      licenseType: 'monthly',
      activationCode: code,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      daysRemaining: 30,
      verified: verification !== null
    }
  }
}

// ─── Get Admin Key Hash (for display to developer) ─────────────────────────
export function getAdminKeyHash(): string {
  return crypto
    .createHash('sha256')
    .update(`${LICENSE_SECRET}:admin-api-key`)
    .digest('hex')
    .substring(0, 16)
}
