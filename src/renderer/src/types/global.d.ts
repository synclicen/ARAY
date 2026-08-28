import type { ArayAPI } from '../preload'

declare global {
  interface Window {
    aray: ArayAPI
  }
}

export {}
