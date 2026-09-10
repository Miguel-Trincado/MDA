export default function TopNav({ active, onChange }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "jefa", label: "Jefa de Ventas" },
  ];
  return (
    <div className="bg-[#0F3D66] text-white px-5 flex items-center justify-between flex-wrap">
      <span className="font-display text-lg py-3 pr-4">Pilpilén</span>
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`text-sm px-4 py-3 border-b-2 transition-colors ${
              active === t.key ? "border-[#4C8DD9] text-white" : "border-transparent text-sky-300 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
