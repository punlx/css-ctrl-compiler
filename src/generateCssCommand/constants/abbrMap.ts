// src/generateCssCommand/constants/abbrMap.ts

export const abbrMap: Record<string, string | string[]> = {
  // multiple style
  mx: ['margin-left', 'margin-right'],
  my: ['margin-top', 'margin-bottom'],
  px: ['padding-left', 'padding-right'],
  py: ['padding-top', 'padding-bottom'],
  sq: ['width', 'height'],
  'max-sq': ['max-width', 'max-height'],
  'min-sq': ['min-width', 'min-height'],
  bdx: ['border-left', 'border-right'],
  bdy: ['border-top', 'border-bottom'],
  // All
  a: 'all',
  // Alignment, Box, Display
  ac: 'align-content',
  ai: 'align-items',
  as: 'align-self',
  d: 'display',

  /********************************************
   * Animation
   ********************************************/
  am: 'animation',
  'am-dl': 'animation-delay',
  'am-dir': 'animation-direction',
  'am-dur': 'animation-duration',
  'am-fm': 'animation-fill-mode',
  'am-c': 'animation-iteration-count',
  'am-n': 'animation-name',
  'am-p': 'animation-play-state',
  'am-timefun': 'animation-timing-function',

  /********************************************
   * Background
   ********************************************/

  bg: 'background-color',
  'bg-img': 'background-image',
  'bg-ps': 'background-position',
  'bg-s': 'background-size',
  'bg-r': 'background-repeat',
  'bg-cp': 'background-clip',
  'bg-o': 'background-origin',
  'bg-b': 'background-blend-mode',

  /********************************************
   * Border / Outline
   ********************************************/
  bd: 'border',
  bdl: 'border-left',
  bdt: 'border-top',
  bdr: 'border-right',
  bdb: 'border-bottom',
  'bd-w': 'border-width',
  'bd-c': 'border-color',
  'bd-st': 'border-style',

  'bdl-w': 'border-left-width',
  'bdl-c': 'border-left-color',
  'bdl-st': 'border-left-style',

  'bdt-w': 'border-top-width',
  'bdt-c': 'border-top-color',
  'bdt-st': 'border-top-style',

  'bdr-w': 'border-right-width',
  'bdr-c': 'border-right-color',
  'bdr-st': 'border-right-style',

  'bdb-w': 'border-bottom-width',
  'bdb-c': 'border-bottom-color',
  'bdb-st': 'border-bottom-style',

  'bd-s': 'border-spacing',
  'bd-cl': 'border-collapse',
  'bd-img': 'border-image',
  br: 'border-radius',
  ol: 'outline',
  'ol-w': 'outline-width',
  'ol-c': 'outline-color',
  'ol-st': 'outline-style',
  'ol-ofs': 'outline-offset',

  /********************************************
   * Box Shadow / Sizing
   ********************************************/
  sd: 'box-shadow',
  bs: 'box-sizing',

  /********************************************
   * Color, Cursor
   ********************************************/
  c: 'color',
  cs: 'cursor',

  /********************************************
   * Container Query
   ********************************************/
  'ctn-type': 'container-type',
  ctn: 'container',
  'ctn-name': 'container-name',

  /********************************************
   * Columns / Gap
   ********************************************/
  cols: 'columns',
  'col-gap': 'column-gap',
  'row-gap': 'row-gap',
  gap: 'gap',

  /********************************************
   * Flex / Grid
   ********************************************/
  fx: 'flex',
  'fx-b': 'flex-basis', // (สำรอง ถ้าอยากใช้ basis[...] ตรง ๆ)
  'fx-w': 'flex-wrap',
  'fx-d': 'flex-direction',
  'fx-f': 'flex-flow',
  'fx-g': 'flex-grow',
  'fx-s': 'flex-shrink',

  gd: 'grid',
  gda: 'grid-area',
  'gd-ac': 'grid-auto-columns',
  'gd-af': 'grid-auto-flow',
  'gd-ar': 'grid-auto-rows',
  'gd-col': 'grid-column',
  'gd-ce': 'grid-column-end',
  'gd-cg': 'grid-column-gap',
  'gd-cs': 'grid-column-start',
  'gd-gap': 'grid-gap',
  'gd-row': 'grid-row',
  'gd-re': 'grid-row-end',
  'gd-rg': 'grid-row-gap',
  'gd-rs': 'grid-row-start',
  'gd-t': 'grid-template',
  'gd-ta': 'grid-template-areas',
  'gd-tc': 'grid-template-columns',
  'gd-tr': 'grid-template-rows',

  /********************************************
   * Justify / Align / Place
   ********************************************/
  jc: 'justify-content',
  ji: 'justify-items',
  js: 'justify-self',
  pc: 'place-content',
  pli: 'place-items',
  pls: 'place-self',

  /********************************************
   * Font / Text
   ********************************************/
  // เปลี่ยนมาใช้ f => 'font' (แทนที่จะ parse เป็น theme.font)
  f: 'font',
  // ต้องมี typography เพื่อเช็คว่า ty ยังสามารถใช้ได้
  ty: 'typography',
  fm: 'font-family',
  fs: 'font-size',
  fw: 'font-weight',
  fst: 'font-style',
  fv: 'font-variant',
  ffs: 'font-feature-settings',
  lh: 'line-height',
  ls: 'letter-spacing',
  ws: 'word-spacing',

  'tx-a': 'text-align',
  'tx-d': 'text-decoration',
  'tx-i': 'text-indent',
  'tx-j': 'text-justify',
  'tx-ovf': 'text-overflow',
  'tx-sd': 'text-shadow',
  'tx-tf': 'text-transform',
  'tx-w': 'text-wrap',
  'tx-u-ps': 'text-underline-position',
  wb: 'word-break',
  'tx-ws': 'white-space',

  'tx-sa': 'text-size-adjust',
  'tx-dl': 'text-decoration-line',
  'tx-dc': 'text-decoration-color',
  'tx-ds': 'text-decoration-style',
  'tx-dsi': 'text-decoration-skip-ink',

  /********************************************
   * Filter / Blend / Backdrop
   ********************************************/
  ft: 'filter',
  bft: 'backdrop-filter',
  '-webkit-bft': '-webkit-backdrop-filter',
  mbm: 'mix-blend-mode',

  /********************************************
   * Dimensions / Spacing
   ********************************************/
  w: 'width',
  'max-w': 'max-width',
  'min-w': 'min-width',
  h: 'height',
  'max-h': 'max-height',
  'min-h': 'min-height',
  hp: 'hyphens',

  m: 'margin',
  ml: 'margin-left',
  mt: 'margin-top',
  mr: 'margin-right',
  mb: 'margin-bottom',

  p: 'padding',
  pl: 'padding-left',
  pt: 'padding-top',
  pr: 'padding-right',
  pb: 'padding-bottom',

  /********************************************
   * Position
   ********************************************/
  ps: 'position',
  l: 'left',
  t: 'top',
  r: 'right',
  b: 'bottom',
  z: 'z-index',

  /********************************************
   * Object
   ********************************************/
  'obj-fit': 'object-fit',
  'obj-ps': 'object-position',

  /********************************************
   * Aspect Ratio
   ********************************************/
  ar: 'aspect-ratio',

  /********************************************
   * Overflow / Scroll Behavior
   ********************************************/
  ovf: 'overflow',
  'ovf-x': 'overflow-x',
  'ovf-w': 'overflow-wrap',
  'ovf-y': 'overflow-y',
  'sc-b': 'scroll-behavior',
  'ovsc-b': 'overscroll-behavior',
  'ovsc-bx': 'overscroll-behavior-x',
  'ovsc-by': 'overscroll-behavior-y',
  rs: 'resize',
  op: 'opacity',

  /********************************************
   * Opacity, Pointer Events, Cursor
   ********************************************/
  pe: 'pointer-events',

  /********************************************
   * Transform / Transition / Will-change
   ********************************************/
  tf: 'transform',
  'tf-o': 'transform-origin',
  'tf-b': 'transform-box',
  'tf-s': 'transform-style',
  pst: 'perspective',
  'pst-o': 'perspective-origin',
  bv: 'backface-visibility',

  ts: 'transition',
  'ts-dl': 'transition-delay',
  'ts-d': 'transition-duration',
  'ts-p': 'transition-property',
  'ts-f': 'transition-timing-function',
  wc: 'will-change',

  /********************************************
   * Mask / Clip
   ********************************************/
  mask: 'mask',
  'mask-img': 'mask-image',
  '-webkit-mask': '-webkit-mask',
  '-webkit-mask-img': '-webkit-mask-image',
  cp: 'clip-path',
  '-webkit-cp': '-webkit-clip-path',

  /********************************************
   * Appearance / User-select
   ********************************************/
  app: 'appearance',
  '-webkit-app': '-webkit-appearance',

  us: 'user-select',
  '-webkit-us': '-webkit-user-select',

  /********************************************
   * Misc
   ********************************************/
  iso: 'isolation',
  ct: 'content',
  /**
   * Visibility / Direction / Writing
   */
  v: 'visibility',
  dr: 'direction',
  wm: 'writing-mode',

  /**
   * Tab / Quotes / Text Emphasis
   */
  tab: 'tab-size',
  q: 'quotes',
  'tx-em-st': 'text-emphasis-style',
  'tx-em-c': 'text-emphasis-color',
  'tx-em-ps': 'text-emphasis-position',

  /**
   * Inset (Logical Positioning)
   */
  ins: 'inset',
  'ins-i': 'inset-inline',
  'ins-b': 'inset-block',
  'ins-is': 'inset-inline-start',
  'ins-ie': 'inset-inline-end',
  'ins-bs': 'inset-block-start',
  'ins-be': 'inset-block-end',

  /**
   * Containment / Performance
   */
  cnt: 'contain',
  'cnt-s': 'contain-intrinsic-size',

  /**
   * Scroll Snap
   */
  'sc-st': 'scroll-snap-type',
  'sc-sa': 'scroll-snap-align',
  'sc-ss': 'scroll-snap-stop',
  'sc-p': 'scroll-padding',
  'sc-m': 'scroll-margin',

  /**
   * Accent / Caret / Selection / Marker
   */
  acc: 'accent-color',
  caret: 'caret-color',
  fca: 'forced-color-adjust',
  'c-scheme': 'color-scheme',
};
