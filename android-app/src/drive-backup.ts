/**
 * ARAY Android — Drive Backup TypeScript interface
 *
 * Bridge ke native DriveBackupPlugin (Java) via Capacitor.
 * Plugin menggunakan Android Storage Access Framework (SAF) untuk
 * auto-upload ke Google Drive — same approach as Saatiril-Andro.
 *
 * Flow:
 *  1. User tap "Connect Google Drive" → pickFolder() → SAF folder picker
 *  2. User pilih folder Google Drive → URI persisted (survives reboot)
 *  3. Setiap foto disimpan lokal → uploadFile() auto-upload ke Drive
 *  4. Google Drive app handle cloud sync (async, built-in retry)
 */

import { registerPlugin } from '@capacitor/core'

export interface DriveBackupPlugin {
  pickFolder(): Promise<{ success: boolean; uri: string }>
  hasFolder(): Promise<{ hasFolder: boolean; uri: string }>
  clearFolder(): Promise<void>
  getFolderUri(): Promise<{ uri: string; connected: boolean }>
  uploadFile(options: {
    localPath: string
    filename: string
    projectName?: string
    mimeType?: string
  }): Promise<{ success: boolean; driveUri: string }>
}

// Register the native plugin — must match @CapacitorPlugin(name = "DriveBackup")
export const DriveBackup = registerPlugin<DriveBackupPlugin>('DriveBackup')
