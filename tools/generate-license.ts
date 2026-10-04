#!/usr/bin/env node
/**
 * ARAY — License Generator Tool
 *
 * Cara pakai:
 *   npx tsx tools/generate-license.ts <machineId>
 *
 * Output: Activation code (XXXX-XXXX-XXXX-XXXX) yang valid 30 hari
 */

import * as crypto from 'crypto'

const LICENSE_SECRET = 'ARAY-2026-HUMAS-UIN-ANTASARI-BANJARMASIN'

function generateExpectedCode(
  machineId: string,
  licenseType: 'monthly',
  expiresAt: string
): string {
  const expiryStr = new Date(expiresAt).getTime().toString(16)
  const input = `${machineId}:${licenseType}:${expiryStr}:${LICENSE_SECRET}`
  const hash = crypto.createHash('sha256').update(input).digest('hex')
  const code = hash.substring(0, 16).toUpperCase()
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
}

function main() {
  const machineId = process.argv[2]
  if (!machineId) {
    console.error('Usage: npx tsx tools/generate-license.ts <machineId>')
    process.exit(1)
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  expiresAt.setHours(23, 59, 59, 0)

  const code = generateExpectedCode(machineId, 'monthly', expiresAt.toISOString())

  console.log('\n========================================')
  console.log('       ARAY License Generator')
  console.log('========================================\n')
  console.log(`Machine ID:    ${machineId.substring(0, 24)}...`)
  console.log(`License Type:  monthly`)
  console.log(`Expires At:    ${expiresAt.toISOString()}`)
  console.log(`Expires (ID):  ${expiresAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  console.log(`\nActivation Code:`)
  console.log(`\n  >>>  ${code}  <<<\n`)
  console.log('Kirim kode ini ke user untuk aktivasi.\n')
}

main()
