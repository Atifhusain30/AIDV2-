/**
 * Driver Onboarding Screen
 * Document upload flow for driver verification
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, 
  FileCheck, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft,
  Camera,
  X,
  Loader2,
  Check,
  Shield,
  Clock
} from 'lucide-react'
import { useDriverStore } from '../../store/useDriverStore'
import { useAuthStore } from '../../store/useAuthStore'
import { documentService, DOCUMENT_TYPE_LABELS } from '../../services/documents'
import type { DriverDocument } from '../../types'

interface DriverOnboardingScreenProps {
  onComplete: () => void
  onSkip?: () => void
}

type OnboardingStep = 'welcome' | 'drivers_license' | 'identification' | 'review' | 'complete'

export default function DriverOnboardingScreen({ onComplete, onSkip }: DriverOnboardingScreenProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const { user } = useAuthStore()
  const { documents, addDocument, fetchDocuments } = useDriverStore()

  // Fetch existing documents on mount
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const steps: OnboardingStep[] = ['welcome', 'drivers_license', 'identification', 'review', 'complete']
  const stepIndex = steps.indexOf(currentStep)

  const getDocumentByType = (type: DriverDocument['type']): DriverDocument | undefined => {
    return documents.find(d => d.type === type)
  }

  const handleUpload = async (documentType: DriverDocument['type']) => {
    setIsUploading(true)
    setUploadError(null)

    try {
      const file = await documentService.pickImage()
      
      if (!file) {
        setIsUploading(false)
        return
      }

      if (!user) throw new Error('Driver session required')
      const document = await documentService.uploadDocument(file, documentType, user.id)
      addDocument(document)
      
      // Auto-advance to next step
      setTimeout(() => {
        nextStep()
      }, 500)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const nextStep = () => {
    const nextIndex = stepIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex])
    }
  }

  const prevStep = () => {
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex])
    }
  }

  const renderUploadCard = (documentType: DriverDocument['type'], title: string, description: string) => {
    const existingDoc = getDocumentByType(documentType)
    
    return (
      <motion.div
        className="bg-white/5 border border-white/10 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-400 text-sm mb-6">{description}</p>

        {existingDoc ? (
          // Document uploaded
          <div className="space-y-4">
            <div className="aspect-video rounded-xl overflow-hidden bg-black/30 relative">
              {existingDoc.fileUrl && (
                <img 
                  src={existingDoc.fileUrl} 
                  alt={title}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute top-3 right-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                  <Check size={12} />
                  Uploaded
                </span>
              </div>
            </div>
            <button
              onClick={() => handleUpload(documentType)}
              className="w-full py-3 rounded-xl border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors"
            >
              Replace Document
            </button>
          </div>
        ) : (
          // Upload prompt
          <button
            onClick={() => handleUpload(documentType)}
            disabled={isUploading}
            className="w-full aspect-video rounded-xl border-2 border-dashed border-white/20 hover:border-emerald-500/50 transition-colors flex flex-col items-center justify-center gap-3 group"
          >
            {isUploading ? (
              <Loader2 size={32} className="text-emerald-400 animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <Camera size={24} className="text-gray-400 group-hover:text-emerald-400" />
                </div>
                <span className="text-gray-400 group-hover:text-emerald-400 text-sm">
                  Tap to upload photo
                </span>
              </>
            )}
          </button>
        )}

        {/* Error message */}
        <AnimatePresence>
          {uploadError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"
            >
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">{uploadError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <div className="driver-onboarding min-h-screen px-6 py-8 safe-top">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">Step {stepIndex + 1} of {steps.length}</span>
          {onSkip && currentStep !== 'complete' && (
            <button onClick={onSkip} className="text-xs text-gray-400 hover:text-white">
              Skip for now
            </button>
          )}
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
            initial={{ width: 0 }}
            animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col items-center text-center"
          >
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
              <Shield size={40} className="text-white" />
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-3">
              Document Verification
            </h1>
            <p className="text-gray-400 mb-8 max-w-sm">
              To ensure safety for everyone, we need to verify your identity. This only takes a few minutes.
            </p>

            <div className="w-full space-y-3 mb-8">
              {[
                { icon: FileCheck, text: "Driver's License (front)" },
                { icon: FileCheck, text: 'Government ID' }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <item.icon size={20} className="text-emerald-400" />
                  </div>
                  <span className="text-white text-sm">{item.text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={nextStep}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2"
            >
              Get Started
              <ChevronRight size={20} />
            </button>
          </motion.div>
        )}

        {/* Driver's License Step */}
        {currentStep === 'drivers_license' && (
          <motion.div
            key="dl"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderUploadCard(
              'drivers_license',
              "Driver's License",
              'Take a clear photo of the front of your valid driver\'s license. Make sure all text is readable.'
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={prevStep}
                className="flex-1 py-4 rounded-xl border border-white/10 text-white font-medium flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!getDocumentByType('drivers_license')}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Continue
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Identification Step */}
        {currentStep === 'identification' && (
          <motion.div
            key="id"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderUploadCard(
              'identification',
              'Government ID',
              'Upload a government-issued ID (passport, state ID, etc.) for identity verification.'
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={prevStep}
                className="flex-1 py-4 rounded-xl border border-white/10 text-white font-medium flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!getDocumentByType('identification')}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Continue
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Review Step */}
        {currentStep === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <h2 className="text-xl font-bold text-white mb-6">Review Your Documents</h2>
            
            <div className="space-y-4 mb-6">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/30">
                    {doc.fileUrl && (
                      <img src={doc.fileUrl} alt={doc.type} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-medium">{DOCUMENT_TYPE_LABELS[doc.type]}</h4>
                    <p className="text-gray-500 text-sm">{doc.fileName}</p>
                  </div>
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 flex items-center gap-1">
                    <Clock size={12} />
                    Pending
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <p className="text-emerald-300 text-sm">
                Your documents will be reviewed within 24-48 hours. You'll be notified once verified.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={prevStep}
                className="flex-1 py-4 rounded-xl border border-white/10 text-white font-medium flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} />
                Back
              </button>
              <button
                onClick={nextStep}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2"
              >
                Submit
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center pt-12"
          >
            <motion.div
              className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-8"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
            >
              <Check size={48} className="text-white" />
            </motion.div>

            <h1 className="text-2xl font-bold text-white mb-3">
              Documents Submitted!
            </h1>
            <p className="text-gray-400 mb-8">
              Our team is reviewing your documents. You'll receive a notification once verified.
            </p>

            <div className="w-full p-4 rounded-xl bg-white/5 border border-white/10 mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Clock size={20} className="text-amber-400" />
                <span className="text-white font-medium">Verification Pending</span>
              </div>
              <p className="text-gray-500 text-sm">
                Estimated time: 24-48 hours
              </p>
            </div>

            <button
              onClick={onComplete}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-4 rounded-xl"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
