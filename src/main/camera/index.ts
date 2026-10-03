import type { CameraProvider } from './CameraProvider'
import { webcamProvider } from './WebcamProvider'

/**
 * Camera provider registry.
 * Future providers register here: CanonProvider, NikonProvider, SonyProvider, etc.
 */
const providers = new Map<string, CameraProvider>()
providers.set('webcam', webcamProvider)

export function getCameraProvider(name = 'webcam'): CameraProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(`Camera provider not found: ${name}`)
  }
  return provider
}

export function listCameraProviders(): string[] {
  return Array.from(providers.keys())
}

export { webcamProvider }
export * from './CameraProvider'
