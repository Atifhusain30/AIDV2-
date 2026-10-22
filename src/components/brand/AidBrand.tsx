import { motion } from 'framer-motion'

interface AidBrandProps {
  compact?: boolean
  inverse?: boolean
  label?: string
}

/**
 * The AID glyph: a bold "A" whose crossbar is a location dot — "help, at your location". The same
 * drawing is used for the app icon (ios/…/AppIcon) and the admin sidebar, so the brand is one mark.
 */
export function AidGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg className="aid-glyph" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path d="M8.6 25 L16 7.5 L23.4 25" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="19.4" r="2.3" fill="currentColor" />
    </svg>
  )
}

export default function AidBrand({ compact = false, inverse = false, label }: AidBrandProps) {
  return (
    <div className={`aid-brand ${compact ? 'aid-brand--compact' : ''} ${inverse ? 'aid-brand--inverse' : ''}`}>
      <motion.div
        className="aid-mark"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
      >
        <AidGlyph size={compact ? 24 : 30} />
      </motion.div>
      <div className="aid-brand__copy">
        <strong>AID</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}
