import { RotateCcw } from "lucide-react"

export const SettingInput = ({
  label,
  value,
  onChange,
  onReset,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string
  value: number
  onChange: (val: number) => void
  onReset: () => void
  min: number
  max: number
  step?: number
  unit?: string
}) => {
  const precision = step.toString().includes(".")
    ? step.toString().split(".")[1].length
    : 0
  const formattedValue = Number(value.toFixed(precision))
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-zinc-500 uppercase">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Reset to default"
          >
            <RotateCcw size={12} />
          </button>
          <div className="flex items-center bg-zinc-800/50 rounded px-2 py-0.5 border border-zinc-700/50">
            <input
              type="text"
              inputMode="decimal"
              value={formattedValue}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-8 bg-transparent text-right outline-none text-xs font-mono"
            />
            {unit && (
              <span className="text-xs text-zinc-500 ml-1 w-4">{unit}</span>
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
        className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  )
}
