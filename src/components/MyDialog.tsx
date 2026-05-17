import React from "react"
import { motion, AnimatePresence } from "motion/react"

interface MyDialogProps {
  BackgroundStyle?: string
  InnerStyle?: string
  isVisible: boolean
  children?: React.ReactNode
  handleClose?: () => void
}

export function MyDialog({
  isVisible,
  children,
  BackgroundStyle,
  InnerStyle,
  handleClose
}: MyDialogProps) {

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={"fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" + BackgroundStyle}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={"bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl z-99" + InnerStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}