/**
 * ARAY Camera2 Native Plugin — TypeScript interface
 *
 * Native Camera2 API untuk akses USB capture card / DSLR.
 * Port dari Saatiril-Andro Camera2Manager.kt
 */

import { registerPlugin } from '@capacitor/core'

export interface CameraInfo {
  id: string
  label: string
  isExternal: boolean
  facing: number
}

export interface Camera2NativePlugin {
  enumerateCameras(): Promise<{ cameras: CameraInfo[] }>
  openCamera(options: { cameraId?: string }): Promise<{ success: boolean; cameraId: string }>
  capturePhoto(): Promise<{ success: boolean; base64: string; width: number; height: number }>
  closeCamera(): Promise<void>
  forceRescan(): Promise<{ cameras: CameraInfo[] }>

  // Event listeners
  addListener(
    event: 'camera2:frame',
    listener: (data: { data: string; width: number; height: number }) => void
  ): Promise<any>
  addListener(
    event: 'camera2:opened',
    listener: (data: { success: boolean; cameraId: string }) => void
  ): Promise<any>
  addListener(
    event: 'camera2:disconnected',
    listener: () => void
  ): Promise<any>
  addListener(
    event: 'camera2:error',
    listener: (data: { success: boolean; error: string }) => void
  ): Promise<any>
}

export const Camera2Native = registerPlugin<Camera2NativePlugin>('Camera2Native')
