//deprecated, keep for reusing

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"

interface props {
  onClick: React.MouseEventHandler<HTMLButtonElement>
  title: string
  children: React.ReactNode
}

export function PopOutButton({ onClick, title, children }: props) {
  const [isInitialShow, setIsInitialShow] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialShow(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  const isVisible = isInitialShow || isHovered

  return (
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 w-24 h-16 pt-4 flex justify-center z-[100] pointer-events-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute top-0 left-0 w-full h-full pointer-events-auto" />

      <motion.button
        initial={{ y: -60 }}
        animate={{ y: isVisible ? 0 : -60 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
        className="
            pointer-events-auto relative z-10
            bg-zinc-800 text-white text-xs w-10 h-10 rounded-full shadow-md
            flex items-center justify-center
            hover:bg-zinc-700 transition-colors
          "
        title={title}
        onClick={onClick}
      >
        {children}
      </motion.button>
    </div>
  )
}
