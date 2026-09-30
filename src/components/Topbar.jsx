import { useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { Avatar } from "./Shared";

export default function Topbar({ email, onLogout }) {
  const [open, setOpen] = useState(false);
  if (!email) return <div className="h-16 border-b border-stone-200 bg-white" />;

  return (
    <div className="h-16 border-b border-stone-200 bg-white flex items-center justify-end px-6 relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 hover:bg-stone-50 rounded-lg px-2 py-1.5 transition-colors">
        <Avatar name={email} />
        <span className="text-sm text-stone-600">{email}</span>
        <ChevronDown size={14} className="text-stone-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-6 top-14 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 w-44">
            <button
              onClick={() => {
                setOpen(false);
                onLogout && onLogout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
