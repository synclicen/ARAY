/**
 * ARAY Template System — real composite templates with photo slots
 */

export interface TemplateSlot {
  x: number
  y: number
  width: number
  height: number
}

export interface ArayTemplateDef {
  id: string
  name: string
  description: string
  variant: 'purple' | 'gold' | 'silver'
  shotCount: number
  canvasWidth: number
  canvasHeight: number
  slots: TemplateSlot[]
  bgColor: string
  frameColor: string
  accentColor: string
  titleText?: string
  subtitleText?: string
}

export const TEMPLATES: ArayTemplateDef[] = [
  {
    id: 'classic-strip-4',
    name: 'Classic Strip (4 photos)',
    description: 'Vertical photo strip — 4 shots stacked, purple frame',
    variant: 'purple',
    shotCount: 4,
    canvasWidth: 600,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 8, width: 90, height: 20 },
      { x: 5, y: 31, width: 90, height: 20 },
      { x: 5, y: 54, width: 90, height: 20 },
      { x: 5, y: 77, width: 90, height: 20 }
    ],
    bgColor: '#1A1330',
    frameColor: '#C0C0C8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  },
  {
    id: 'gold-grid-4',
    name: 'Gold Grid (2x2)',
    description: '2x2 grid — 4 shots, gold accents on dark purple',
    variant: 'gold',
    shotCount: 4,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 8, width: 42, height: 38 },
      { x: 53, y: 8, width: 42, height: 38 },
      { x: 5, y: 50, width: 42, height: 38 },
      { x: 53, y: 50, width: 42, height: 38 }
    ],
    bgColor: '#0F0B1A',
    frameColor: '#D4AF37',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Yap. Snap. Repeat.'
  },
  {
    id: 'silver-triple',
    name: 'Silver Triple (3 photos)',
    description: '3 shots horizontal, silver metallic frame',
    variant: 'silver',
    shotCount: 3,
    canvasWidth: 1800,
    canvasHeight: 600,
    slots: [
      { x: 3, y: 10, width: 30, height: 75 },
      { x: 35, y: 10, width: 30, height: 75 },
      { x: 67, y: 10, width: 30, height: 75 }
    ],
    bgColor: '#241A40',
    frameColor: '#C0C0C8',
    accentColor: '#7B61A8',
    titleText: 'ARAY'
  },
  {
    id: 'single-photo',
    name: 'Single Photo',
    description: 'One large photo with ARAY border',
    variant: 'purple',
    shotCount: 1,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 8, y: 8, width: 84, height: 78 }
    ],
    bgColor: '#1A1330',
    frameColor: '#7B61A8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  }
]

// ─── CUSTOM TEMPLATE (user-uploaded frame) ──────────────────────
export interface CustomTemplate {
  id: string
  name: string
  frameDataUrl: string  // user-uploaded frame image (PNG with transparency)
  shotCount: number
  layout: 'strip-4' | 'grid-4' | 'triple-3' | 'single-1'
  canvasWidth: number
  canvasHeight: number
}

const CUSTOM_KEY = 'aray_custom_templates'

export function getCustomTemplates(): CustomTemplate[] {
  try {
    const data = localStorage.getItem(CUSTOM_KEY)
    return data ? JSON.parse(data) : []
  } catch { return [] }
}

export function saveCustomTemplate(t: CustomTemplate): void {
  const all = getCustomTemplates()
  const idx = all.findIndex(x => x.id === t.id)
  if (idx >= 0) all[idx] = t; else all.push(t)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all))
}

export function deleteCustomTemplate(id: string): void {
  const all = getCustomTemplates().filter(x => x.id !== id)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all))
}

// Layout presets for custom templates
const LAYOUT_SLOTS: Record<string, TemplateSlot[]> = {
  'strip-4': [
    { x: 5, y: 8, width: 90, height: 20 },
    { x: 5, y: 31, width: 90, height: 20 },
    { x: 5, y: 54, width: 90, height: 20 },
    { x: 5, y: 77, width: 90, height: 20 }
  ],
  'grid-4': [
    { x: 5, y: 8, width: 42, height: 38 },
    { x: 53, y: 8, width: 42, height: 38 },
    { x: 5, y: 50, width: 42, height: 38 },
    { x: 53, y: 50, width: 42, height: 38 }
  ],
  'triple-3': [
    { x: 3, y: 10, width: 30, height: 75 },
    { x: 35, y: 10, width: 30, height: 75 },
    { x: 67, y: 10, width: 30, height: 75 }
  ],
  'single-1': [
    { x: 8, y: 8, width: 84, height: 78 }
  ]
}

const LAYOUT_SHOT_COUNT: Record<string, number> = {
  'strip-4': 4, 'grid-4': 4, 'triple-3': 3, 'single-1': 1
}

const LAYOUT_DIMS: Record<string, { w: number; h: number }> = {
  'strip-4': { w: 600, h: 1800 },
  'grid-4': { w: 1200, h: 1800 },
  'triple-3': { w: 1800, h: 600 },
  'single-1': { w: 1200, h: 1800 }
}

export async function compositeCustomTemplate(
  custom: CustomTemplate,
  photoDataUrls: string[]
): Promise<string | null> {
  try {
    const dims = LAYOUT_DIMS[custom.layout] || LAYOUT_DIMS['strip-4']
    const slots = LAYOUT_SLOTS[custom.layout] || LAYOUT_SLOTS['strip-4']
    const canvas = document.createElement('canvas')
    canvas.width = dims.w
    canvas.height = dims.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw photos into slots
    const photos = photoDataUrls.slice(0, slots.length)
    for (let i = 0; i < slots.length && i < photos.length; i++) {
      const slot = slots[i]
      const img = await loadImage(photos[i])
      if (!img) continue
      const sx = (slot.x / 100) * canvas.width
      const sy = (slot.y / 100) * canvas.height
      const sw = (slot.width / 100) * canvas.width
      const sh = (slot.height / 100) * canvas.height
      drawImageCover(ctx, img, sx, sy, sw, sh)
    }

    // Overlay custom frame image on top
    const frameImg = await loadImage(custom.frameDataUrl)
    if (frameImg) {
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)
    }

    return canvas.toDataURL('image/jpeg', 0.92)
  } catch (err) {
    console.error('[Custom Template] Composite failed:', err)
    return null
  }
}

export function getLayoutShotCount(layout: string): number {
  return LAYOUT_SHOT_COUNT[layout] || 4
}

export async function compositeTemplate(
  template: ArayTemplateDef,
  photoDataUrls: string[]
): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = template.canvasWidth
    canvas.height = template.canvasHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = template.bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = template.frameColor
    ctx.lineWidth = 8
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40)

    ctx.strokeStyle = template.accentColor
    ctx.lineWidth = 2
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)

    const photosToUse = photoDataUrls.slice(0, template.slots.length)
    for (let i = 0; i < template.slots.length && i < photosToUse.length; i++) {
      const slot = template.slots[i]
      const img = await loadImage(photosToUse[i])
      if (!img) continue

      const sx = (slot.x / 100) * canvas.width
      const sy = (slot.y / 100) * canvas.height
      const sw = (slot.width / 100) * canvas.width
      const sh = (slot.height / 100) * canvas.height

      drawImageCover(ctx, img, sx, sy, sw, sh)
      ctx.strokeStyle = template.frameColor
      ctx.lineWidth = 3
      ctx.strokeRect(sx, sy, sw, sh)
    }

    if (template.titleText) {
      ctx.fillStyle = template.accentColor
      ctx.font = 'bold 48px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(template.titleText, canvas.width / 2, canvas.height - 80)
    }

    if (template.subtitleText) {
      ctx.fillStyle = template.frameColor
      ctx.font = 'italic 20px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(template.subtitleText, canvas.width / 2, canvas.height - 40)
    }

    return canvas.toDataURL('image/jpeg', 0.92)
  } catch (err) {
    console.error('[Template] Composite failed:', err)
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number
) {
  const imgRatio = img.width / img.height
  const slotRatio = dw / dh
  let sx = 0, sy = 0, sw = img.width, sh = img.height

  if (imgRatio > slotRatio) {
    sw = img.height * slotRatio
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / slotRatio
    sy = (img.height - sh) / 2
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}
