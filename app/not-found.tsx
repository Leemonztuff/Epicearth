'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white select-none">
      <div className="text-center p-8 bg-[#0b1530] border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
        <Shield className="w-12 h-12 stroke-rose-500 animate-pulse mx-auto mb-4" />
        <h2 className="text-lg font-medium text-slate-100 tracking-tight">Página No Encontrada</h2>
        <p className="text-xs font-mono text-slate-400 mt-2">No se pudo encontrar el recurso solicitado en Prontera Sandbox.</p>
        <Link 
          href="/" 
          className="mt-6 inline-flex items-center justify-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-mono font-bold tracking-wider rounded-lg transition-colors cursor-pointer"
        >
          VOLVER AL SANDBOX ESPACIAL
        </Link>
      </div>
    </div>
  );
}
