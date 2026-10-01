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
