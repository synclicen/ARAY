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

// Aspect ratio dimensions for composite output
const ASPECT_DIMS: Record<string, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:3': { w: 1440, h: 1080 },
  '16:9': { w: 1920, h: 1080 }
}

export function getCompositeDims(aspectRatio: string): { w: number; h: number } {
  return ASPECT_DIMS[aspectRatio] || ASPECT_DIMS['9:16']
}

export async function compositeCustomTemplate(
  custom: CustomTemplate,
  photoDataUrls: string[],
  _aspectRatio?: string  // ignored for custom templates — PNG dimensions take priority
): Promise<string | null> {
  try {
    // Load the PNG frame FIRST to get its natural dimensions
    const frameImg = await loadImage(custom.frameDataUrl)
    if (!frameImg) throw new Error('Failed to load frame image')

    // Use PNG frame's natural dimensions as canvas size
    // This ensures the frame is NOT stretched — it's pixel-perfect
    const canvas = document.createElement('canvas')
    canvas.width = frameImg.naturalWidth || custom.canvasWidth || 1080
    canvas.height = frameImg.naturalHeight || custom.canvasHeight || 1920
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // ---- SMART SLOT DETECTION (new in v4.0.3) ----
    // Draw PNG to canvas, scan alpha channel for transparent holes
    // (connected-component labeling). If holes found, use them as slot positions
    // instead of the hardcoded percentages from `custom.layout`.
    // This lets users design template PNGs with arbitrary slot layouts —
    // the system reads the PNG and figures out where to put photos.
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const detectedSlots = detectHolesFromAlpha(imageData, 128, Math.max(1000, Math.floor((canvas.width * canvas.height) * 0.005)))

    // Decide which slot list to use
    let slots: { x: number; y: number; w: number; h: number }[]
    let usingDetected = false
    if (detectedSlots.length >= Math.min(photoDataUrls.length, 1)) {
      // Smart detection found usable holes — use them (pixel coords)
      slots = detectedSlots
      usingDetected = true
      console.log('[compositeCustomTemplate] Smart slot detection:',
        detectedSlots.length, 'slots found in PNG →',
        detectedSlots.map(s => `${s.w}x${s.h} @(${s.x},${s.y})`).join(', '))
    } else {
      // Fallback: use hardcoded percentages from layout
      const info = getLayoutInfo(custom.layout)
      slots = info.slots.map(s => ({
        x: (s.x / 100) * canvas.width,
        y: (s.y / 100) * canvas.height,
        w: (s.width / 100) * canvas.width,
        h: (s.height / 100) * canvas.height
      }))
      console.log('[compositeCustomTemplate] No transparent holes detected in PNG —',
        'falling back to layout', custom.layout, 'with', slots.length, 'slots',
        '(percentages → pixel coords)')
    }

    // Clear canvas (we'll redraw photo + frame)
    // Black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw photos into slots — contain-fit (FULL photo visible, no crop)
    // Photos maintain their aspect ratio, centered in slot with black bars
    const photos = photoDataUrls.slice(0, slots.length)
    for (let i = 0; i < slots.length && i < photos.length; i++) {
      const slot = slots[i]
      const img = await loadImage(photos[i])
      if (!img) continue
      const sx = usingDetected ? slot.x : (slot.x / 100) * canvas.width
      const sy = usingDetected ? slot.y : (slot.y / 100) * canvas.height
      const sw = usingDetected ? slot.w : (slot.w / 100) * canvas.width
      const sh = usingDetected ? slot.h : (slot.h / 100) * canvas.height
      console.log(`[compositeCustomTemplate] Photo ${i + 1}:`,
        `slot ${sw.toFixed(0)}x${sh.toFixed(0)} @ (${sx.toFixed(0)},${sy.toFixed(0)})`,
        `— contain-fit, no crop`)
      drawImageContain(ctx, img, sx, sy, sw, sh)
    }

    // Overlay PNG frame at NATURAL size — no stretching!
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.92)
  } catch (err) {
    console.error('[Custom Template] Composite failed:', err)
    return null
  }
}

export async function compositeTemplate(
  template: ArayTemplateDef,
  photoDataUrls: string[],
  aspectRatio?: string
): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    // If aspectRatio provided, use aspect ratio dims instead of template dims
    const dims = aspectRatio ? getCompositeDims(aspectRatio) : { w: template.canvasWidth, h: template.canvasHeight }
    canvas.width = dims.w
    canvas.height = dims.h
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

// Contain-fit: scale image to fit INSIDE the slot, no cropping.
// Image maintains aspect ratio. Empty area filled with black.
function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number
) {
  const imgRatio = img.width / img.height
  const slotRatio = dw / dh

  let drawW = dw
  let drawH = dh
  let offsetX = 0
  let offsetY = 0

  if (imgRatio > slotRatio) {
    // Image wider than slot — fit to width, center vertically
    drawW = dw
    drawH = dw / imgRatio
    offsetY = (dh - drawH) / 2
  } else {
    // Image taller than slot — fit to height, center horizontally
    drawH = dh
    drawW = dh * imgRatio
    offsetX = (dw - drawW) / 2
  }

  // Fill slot with black background first
  ctx.fillStyle = '#000000'
  ctx.fillRect(dx, dy, dw, dh)

  // Draw image centered in slot
  ctx.drawImage(img, dx + offsetX, dy + offsetY, drawW, drawH)
}

// ─── SMART SLOT DETECTION (v4.0.3) ─────────────────────────────
// Detect transparent regions in a PNG via connected-component labeling
// on the alpha channel. Each connected transparent region = one slot.
//
// Returns bounding boxes in PIXEL coordinates, sorted in reading order:
// top-to-bottom (with row tolerance), then left-to-right within a row.
//
// This lets users design template PNGs with arbitrary slot layouts
// (2 holes, 3 holes, asymmetric, etc.) without needing to specify
// slot positions in code. The system reads the PNG and figures out
// where photos should go.
//
// @param imageData      RGBA ImageData of the template (already drawn to canvas)
// @param alphaThreshold pixels with alpha < this are "hole" (0-255, default 128)
// @param minArea        ignore regions smaller than this (noise filter)
// @returns              bounding boxes sorted in reading order
function detectHolesFromAlpha(
  imageData: ImageData,
  alphaThreshold = 128,
  minArea = 1000
): { x: number; y: number; w: number; h: number }[] {
  const W = imageData.width
  const H = imageData.height
  const data = imageData.data

  // Build binary mask: 1 = hole (transparent), 0 = opaque
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3]
    mask[i] = a < alphaThreshold ? 1 : 0
  }

  // Connected-component labeling via iterative flood fill (4-connectivity)
  // Iterative (stack-based) to avoid stack overflow on large templates.
  const labels = new Int32Array(W * H) // 0 = unlabeled
  const holes: { x: number; y: number; w: number; h: number; area: number }[] = []
  let nextLabel = 1

  for (let seed = 0; seed < W * H; seed++) {
    if (mask[seed] !== 1 || labels[seed] !== 0) continue

    const label = nextLabel++
    let minX = W, minY = H, maxX = 0, maxY = 0, area = 0
    const stack: number[] = [seed]
    labels[seed] = label

    while (stack.length > 0) {
      const idx = stack.pop()!
      const x = idx % W
      const y = (idx / W) | 0

      area++
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y

      // 4-connectivity neighbors
      if (x > 0) {
        const n = idx - 1
        if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n) }
      }
      if (x < W - 1) {
        const n = idx + 1
        if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n) }
      }
      if (y > 0) {
        const n = idx - W
        if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n) }
      }
      if (y < H - 1) {
        const n = idx + W
        if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n) }
      }
    }

    if (area >= minArea) {
      holes.push({
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        area
      })
    }
  }

  // Sort in READING ORDER:
  // Group by row (using tolerance = max(8px, avgH/3)), then left-to-right within row.
  if (holes.length > 0) {
    const avgH = holes.reduce((s, h) => s + h.h, 0) / holes.length
    const rowTol = Math.max(8, avgH / 3)
    holes.sort((a, b) => {
      const rowA = Math.floor(a.y / rowTol)
      const rowB = Math.floor(b.y / rowTol)
      if (rowA !== rowB) return rowA - rowB
      return a.x - b.x
    })
  }

  return holes.map(h => ({ x: h.x, y: h.y, w: h.w, h: h.h }))
}

// Public helper: detect slots in a PNG and return detailed info.
// Useful for UI: "Template has 2 slots: 800x600 (1.33:1), 800x600 (1.33:1)"
export async function detectTemplateSlots(
  pngDataUrl: string
): Promise<{ x: number; y: number; w: number; h: number; aspectRatio: number }[]> {
  const img = await loadImage(pngDataUrl)
  if (!img) return []
  const W = img.naturalWidth
  const H = img.naturalHeight
  if (W === 0 || H === 0) return []

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, W, H)
  const holes = detectHolesFromAlpha(imageData, 128, Math.max(1000, Math.floor((W * H) * 0.005)))
  return holes.map(h => ({
    x: h.x,
    y: h.y,
    w: h.w,
    h: h.h,
    aspectRatio: h.w / h.h
  }))
}
