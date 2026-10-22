/**
 * ARAY Android — Drive Backup TypeScript interface
 *
 * Bridge ke native DriveBackupPlugin (Java) via Capacitor.
 * Plugin menggunakan Android Storage Access Framework (SAF) untuk:
 *  1. Local storage — user pilih folder di HP untuk simpan foto lokal
 *  2. Google Drive backup — user pilih folder Google Drive untuk auto-upload
 *
 * Port dari Saatiril-Andro DriveBackupManager.kt
 */

import { registerPlugin } from '@capacitor/core'

export interface DriveBackupPlugin {
  // ─── LOCAL STORAGE ────────────────────────────────────────────────────
  pickLocalFolder(): Promise<{ success: boolean; uri: string }>
  hasLocalFolder(): Promise<{ hasFolder: boolean; uri: string }>
  clearLocalFolder(): Promise<void>
  getLocalFolderUri(): Promise<{ uri: string; connected: boolean }>
  saveLocalFile(options: {
    base64Data: string
    filename: string
    subfolder?: string
    mimeType?: string
  }): Promise<{ success: boolean; path: string }>
  readLocalFile(options: { path: string }): Promise<{ success: boolean; data: string }>
  deleteLocalFile(options: { path: string }): Promise<void>
  listLocalFiles(): Promise<{ files: Array<{ name: string; uri: string; size: number }> }>

  // ─── GOOGLE DRIVE BACKUP ──────────────────────────────────────────────
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
