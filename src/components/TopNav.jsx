export default function TopNav({ active, onChange }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ejecutivo", label: "Ejecutivo" },
    { key: "jefa", label: "Jefa de Ventas" },
  ];
  return (
    <div className="bg-teal-950 text-teal-50 px-5 flex items-center justify-between flex-wrap">
      <span className="font-display text-lg py-3 pr-4">Pilpilén</span>
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`text-sm px-4 py-3 border-b-2 transition-colors ${
              active === t.key ? "border-amber-400 text-white" : "border-transparent text-teal-300 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
