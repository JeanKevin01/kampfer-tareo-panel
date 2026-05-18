interface Props { title: string; desc: string; icon: string }

export default function Placeholder({ title, desc, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] text-center select-none">
      <div className="text-6xl mb-5 opacity-20">{icon}</div>
      <h2 className="font-condensed font-bold text-2xl text-k-text mb-2 tracking-tight">
        {title}
      </h2>
      <p className="text-k-text3 text-sm max-w-xs leading-relaxed mb-6">{desc}</p>
      <div className="inline-flex items-center gap-2 bg-k-raised border border-k-border rounded-lg px-4 py-2">
        <span className="w-2 h-2 rounded-full bg-k-amber animate-pulse" />
        <span className="text-xs text-k-text3 font-medium">Módulo en construcción</span>
      </div>
    </div>
  )
}