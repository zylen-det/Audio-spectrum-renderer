import { RotateCcw } from "lucide-react"
import { useState, useEffect } from "react"

interface SettingInputProps {
  label: string
  value: number
  onChange: (val: number) => void
  onReset: () => void
  min: number
  max: number
  step?: number
  unit?: string
  title?: string
}

export const SettingInput = ({
  label,
  value,
  onChange,
  onReset,
  min,
  max,
  step = 1,
  unit = "",
  title,
}: SettingInputProps) => {
  const [displayValue, setDisplayValue] = useState(value.toString())

  useEffect(() => {
    if (parseFloat(displayValue) !== value) {
      setDisplayValue(value.toString())
    }
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value
    if (nextVal === "" || /^-?[0-9]*\.?[0-9]*$/.test(nextVal)) {
      setDisplayValue(nextVal)
      const parsed = parseFloat(nextVal)
      if (!isNaN(parsed)) {
        onChange(parsed)
      }
    }
  }

  const handleBlur = () => {
    const clamped = Math.min(max, Math.max(min, value))
    onChange(clamped)
    setDisplayValue(clamped.toString())
  }

  return (
    <div title={title} className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
          <div className="flex items-center bg-zinc-800/50 rounded px-2 py-0.5 border border-zinc-700/50 focus-within:border-zinc-500 transition-colors">
            <input
              type="text"
              inputMode="decimal"
              value={displayValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              className="w-10 bg-transparent text-right outline-none text-xs font-mono text-zinc-200"
            />
            {unit && (
              <span className="text-[10px] text-zinc-500 ml-1 font-medium">
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer hover:bg-zinc-700 transition-colors"
      />
    </div>
  )
}
