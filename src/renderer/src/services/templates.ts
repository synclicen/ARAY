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
  // ─── 1 PHOTO ────────────────────────────────────────────────
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
  },

  // ─── 2 PHOTOS ───────────────────────────────────────────────
  {
    id: 'duo-vertical',
    name: 'Duo Vertical (2 photos)',
    description: '2 shots stacked vertically, purple frame',
    variant: 'purple',
    shotCount: 2,
    canvasWidth: 600,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 8, width: 90, height: 38 },
      { x: 5, y: 50, width: 90, height: 38 }
    ],
    bgColor: '#1A1330',
    frameColor: '#C0C0C8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  },
  {
    id: 'duo-horizontal',
    name: 'Duo Horizontal (2 photos)',
    description: '2 photos side by side, silver frame',
    variant: 'silver',
    shotCount: 2,
    canvasWidth: 1800,
    canvasHeight: 900,
    slots: [
      { x: 3, y: 10, width: 45, height: 75 },
      { x: 52, y: 10, width: 45, height: 75 }
    ],
    bgColor: '#241A40',
    frameColor: '#C0C0C8',
    accentColor: '#7B61A8',
    titleText: 'ARAY'
  },
  {
    id: 'duo-split',
    name: 'Duo Split (2 photos)',
    description: 'Top-bottom split with gold divider',
    variant: 'gold',
    shotCount: 2,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 90, height: 42 },
      { x: 5, y: 52, width: 90, height: 42 }
    ],
    bgColor: '#0F0B1A',
    frameColor: '#D4AF37',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Yap. Snap. Repeat.'
  },

  // ─── 3 PHOTOS ───────────────────────────────────────────────
  {
    id: 'silver-triple',
    name: 'Triple Horizontal (3 photos)',
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
    id: 'triple-vertical',
    name: 'Triple Vertical (3 photos)',
    description: '3 shots stacked vertically, purple frame',
    variant: 'purple',
    shotCount: 3,
    canvasWidth: 600,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 6, width: 90, height: 26 },
      { x: 5, y: 36, width: 90, height: 26 },
      { x: 5, y: 66, width: 90, height: 26 }
    ],
    bgColor: '#1A1330',
    frameColor: '#7B61A8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  },
  {
    id: 'triple-lifestyle',
    name: 'Triple Lifestyle (3 photos)',
    description: '1 big + 2 small, lifestyle collage style',
    variant: 'gold',
    shotCount: 3,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 90, height: 50 },
      { x: 5, y: 58, width: 43, height: 35 },
      { x: 52, y: 58, width: 43, height: 35 }
    ],
    bgColor: '#0F0B1A',
    frameColor: '#D4AF37',
    accentColor: '#7B61A8',
    titleText: 'ARAY',
    subtitleText: 'Yap. Snap. Repeat.'
  },

  // ─── 4 PHOTOS ───────────────────────────────────────────────
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
    id: 'four-horizontal',
    name: 'Four Horizontal (4 photos)',
    description: '4 shots in a row, silver frame',
    variant: 'silver',
    shotCount: 4,
    canvasWidth: 2400,
    canvasHeight: 600,
    slots: [
      { x: 2, y: 10, width: 23, height: 75 },
      { x: 26, y: 10, width: 23, height: 75 },
      { x: 50, y: 10, width: 23, height: 75 },
      { x: 74, y: 10, width: 23, height: 75 }
    ],
    bgColor: '#241A40',
    frameColor: '#C0C0C8',
    accentColor: '#7B61A8',
    titleText: 'ARAY'
  },
  {
    id: 'four-collage',
    name: 'Four Collage (4 photos)',
    description: '1 big + 3 small, magazine collage style',
    variant: 'purple',
    shotCount: 4,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 90, height: 45 },
      { x: 5, y: 53, width: 28, height: 38 },
      { x: 36, y: 53, width: 28, height: 38 },
      { x: 67, y: 53, width: 28, height: 38 }
    ],
    bgColor: '#1A1330',
    frameColor: '#7B61A8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  },

  // ─── 5 PHOTOS ───────────────────────────────────────────────
  {
    id: 'five-strip',
    name: 'Five Strip (5 photos)',
    description: '5 shots vertical strip, gold frame',
    variant: 'gold',
    shotCount: 5,
    canvasWidth: 600,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 90, height: 16 },
      { x: 5, y: 23, width: 90, height: 16 },
      { x: 5, y: 41, width: 90, height: 16 },
      { x: 5, y: 59, width: 90, height: 16 },
      { x: 5, y: 77, width: 90, height: 16 }
    ],
    bgColor: '#0F0B1A',
    frameColor: '#D4AF37',
    accentColor: '#7B61A8',
    titleText: 'ARAY',
    subtitleText: 'Yap. Snap. Repeat.'
  },
  {
    id: 'five-collage',
    name: 'Five Collage (5 photos)',
    description: '1 big + 4 small, premium collage',
    variant: 'silver',
    shotCount: 5,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 90, height: 40 },
      { x: 5, y: 48, width: 43, height: 22 },
      { x: 52, y: 48, width: 43, height: 22 },
      { x: 5, y: 73, width: 43, height: 22 },
      { x: 52, y: 73, width: 43, height: 22 }
    ],
    bgColor: '#241A40',
    frameColor: '#C0C0C8',
    accentColor: '#D4AF37',
    titleText: 'ARAY'
  },

  // ─── 6 PHOTOS ───────────────────────────────────────────────
  {
    id: 'six-grid',
    name: 'Six Grid (2x3)',
    description: '2 columns x 3 rows grid, purple frame',
    variant: 'purple',
    shotCount: 6,
    canvasWidth: 1200,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 5, width: 42, height: 27 },
      { x: 53, y: 5, width: 42, height: 27 },
      { x: 5, y: 35, width: 42, height: 27 },
      { x: 53, y: 35, width: 42, height: 27 },
      { x: 5, y: 65, width: 42, height: 27 },
      { x: 53, y: 65, width: 42, height: 27 }
    ],
    bgColor: '#1A1330',
    frameColor: '#7B61A8',
    accentColor: '#D4AF37',
    titleText: 'ARAY',
    subtitleText: 'Are you Ready? and....Yapping!'
  },
  {
    id: 'six-strip',
    name: 'Six Strip (6 photos)',
    description: '6 shots vertical strip, silver frame',
    variant: 'silver',
    shotCount: 6,
    canvasWidth: 600,
    canvasHeight: 1800,
    slots: [
      { x: 5, y: 4, width: 90, height: 14 },
      { x: 5, y: 19, width: 90, height: 14 },
      { x: 5, y: 34, width: 90, height: 14 },
      { x: 5, y: 49, width: 90, height: 14 },
      { x: 5, y: 64, width: 90, height: 14 },
      { x: 5, y: 79, width: 90, height: 14 }
    ],
    bgColor: '#241A40',
    frameColor: '#C0C0C8',
    accentColor: '#7B61A8',
    titleText: 'ARAY'
  }
]

// ─── CUSTOM TEMPLATE (user-uploaded frame) ──────────────────────
export interface CustomTemplate {
  id: string
  name: string
  frameDataUrl: string  // user-uploaded frame image (PNG with transparency)
  shotCount: number
  layout: string  // any template ID from TEMPLATES (e.g. 'classic-strip-4', 'duo-vertical')
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

// Get layout info from any built-in template by ID
function getLayoutInfo(layoutId: string): { slots: TemplateSlot[]; dims: { w: number; h: number }; shotCount: number } {
  const template = TEMPLATES.find(t => t.id === layoutId)
  if (template) {
    return {
      slots: template.slots,
      dims: { w: template.canvasWidth, h: template.canvasHeight },
      shotCount: template.shotCount
    }
  }
  // Fallback to classic strip
  return {
    slots: TEMPLATES[0].slots,
    dims: { w: TEMPLATES[0].canvasWidth, h: TEMPLATES[0].canvasHeight },
    shotCount: TEMPLATES[0].shotCount
  }
}

export function getLayoutShotCount(layoutId: string): number {
  return getLayoutInfo(layoutId).shotCount
}

export function getLayoutDims(layoutId: string): { w: number; h: number } {
  return getLayoutInfo(layoutId).dims
}

// All available layouts for custom template selector (from built-in templates)
export function getAvailableLayouts(): { id: string; name: string; shotCount: number }[] {
  return TEMPLATES.map(t => ({ id: t.id, name: t.name, shotCount: t.shotCount }))
}

export async function compositeCustomTemplate(
  custom: CustomTemplate,
  photoDataUrls: string[]
): Promise<string | null> {
  try {
    const info = getLayoutInfo(custom.layout)
    const dims = info.dims
    const slots = info.slots
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
