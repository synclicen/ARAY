import type {
  CameraProvider,
  CameraInfo,
  CameraCapability,
  CaptureOptions,
  CaptureResult
} from './CameraProvider'
import { writeFileSync } from 'fs'
import { calculateChecksum } from '../storage/paths'

/**
 * WebcamProvider
 *
 * For Phase 1, the actual webcam preview & frame grab happens in the renderer
 * via navigator.mediaDevices.getUserMedia. The renderer captures a still frame
 * as a base64 image, sends it through IPC to `media.saveCapturedFrame`,
 * and the main process writes it to disk and registers it in the database.
 *
 * This provider exists to keep the abstraction intact for Phase 2+ where we
 * add DSLR providers (Canon EDSDK, Nikon SDK, etc.).
 */
export class WebcamProvider implements CameraProvider {
  readonly name = 'webcam'

  private defaultCapabilities: CameraCapability = {
    resolution: true,
    iso: false,
    shutter_speed: false,
    aperture: false,
    white_balance: true,
    focus: false,
    flash: false,
    live_view: true
  }

  async listCameras(): Promise<CameraInfo[]> {
    // Camera enumeration happens in the renderer (WebRTC).
    // The main process keeps a stub entry for default webcam.
    return [
      {
        id: 'default-webcam',
        name: 'Default Webcam',
        provider: this.name,
        capabilities: this.defaultCapabilities,
        is_default: true
      }
    ]
  }

  async connect(deviceId: string): Promise<boolean> {
    // Renderer handles the actual getUserMedia connection.
    return true
  }

  async disconnect(): Promise<void> {
    // Renderer-side cleanup.
  }

  async getCapabilities(_deviceId: string): Promise<CameraCapability> {
    return this.defaultCapabilities
  }

  /**
   * capture() is invoked by IPC handler `media.saveCapturedFrame` with
   * the base64 frame buffer already extracted from the canvas in renderer.
   */
  async capture(options: CaptureOptions & { frameBuffer: Buffer }): Promise<CaptureResult> {
    writeFileSync(options.outputPath, options.frameBuffer)
    const checksum = calculateChecksum(options.outputPath)
    return { path: options.outputPath, checksum }
  }
}

export const webcamProvider = new WebcamProvider()
