import { motion } from 'framer-motion'

interface AidBrandProps {
  compact?: boolean
  inverse?: boolean
  label?: string
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
        <span className="aid-mark__lane aid-mark__lane--one" />
        <span className="aid-mark__lane aid-mark__lane--two" />
        <span className="aid-mark__lane aid-mark__lane--three" />
      </motion.div>
      <div className="aid-brand__copy">
        <strong>AID</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}
