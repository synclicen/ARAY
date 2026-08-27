/**
 * CameraProvider — abstraction layer for all camera types.
 * Initial implementation: WebcamProvider (uses Chromium getUserMedia in renderer).
 * Future: CanonProvider, NikonProvider, SonyProvider, MirrorlessProvider.
 */

export interface CameraCapability {
  resolution: boolean
  iso: boolean
  shutter_speed: boolean
  aperture: boolean
  white_balance: boolean
  focus: boolean
  flash: boolean
  live_view: boolean
}

export interface CameraInfo {
  id: string
  name: string
  provider: string
  capabilities: CameraCapability
  is_default: boolean
}

export interface CameraSettings {
  resolution?: string
  iso?: string
  shutter_speed?: string
  aperture?: string
  white_balance?: string
  focus?: string
  flash?: boolean
}

export interface CaptureOptions {
  shotNumber: number
  eventId: string
  sessionId: string
  outputPath: string
  settings?: CameraSettings
}

export interface CaptureResult {
  path: string
  checksum: string
}

export interface CameraProvider {
  readonly name: string
  listCameras(): Promise<CameraInfo[]>
  connect(deviceId: string): Promise<boolean>
  disconnect(): Promise<void>
  capture(options: CaptureOptions): Promise<CaptureResult>
  getCapabilities(deviceId: string): Promise<CameraCapability>
}
