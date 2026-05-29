'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, Shield, Swords, Sparkles, Heart, Zap, 
  Settings, RefreshCw, Eye, Info, Layers, 
  AlertTriangle, Play, FastForward, FlaskConical, HelpCircle
} from 'lucide-react';

import { useGameStore } from '../lib/game/state';
import { RagnarokEngine } from '../lib/game/engine';
import { JobClass, HeadgearId } from '../lib/game/types';

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RagnarokEngine | null>(null);

  // Stats and state
  const store = useGameStore();
  const [mounted, setMounted] = useState(false);
  const [fps, setFps] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'controls' | 'report'>('controls');

  // High-precision animation timer frame ticker (drives ultra-smooth radial cooldown covers)
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      setCurrentTime(performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      active = false;
    };
  }, []);

  // Performance FPS reader on client side
  useEffect(() => {
    setMounted(true);
    let frames = 0;
    let prevTime = performance.now();

    const calcFps = () => {
      const time = performance.now();
      frames++;
      if (time > prevTime + 1000) {
        setFps(Math.round((frames * 1000) / (time - prevTime)));
        frames = 0;
        prevTime = time;
      }
      requestAnimationFrame(calcFps);
    };
    const animId = requestAnimationFrame(calcFps);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Initialize Three.js Engine once container is ready
  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    // Build core ragnarok touch engine!
    const engine = new RagnarokEngine(containerRef.current);
    engineRef.current = engine;

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [mounted]);

  // Synchronize Job stats in engine when switched in UI
  useEffect(() => {
    // If job class changes, reset or update billboards implicitly
    if (engineRef.current) {
      // Nothing needed, the continuous frame tick automatically rebuilds texture map on change
    }
  }, [store.jobClass, store.headgear]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#020617] text-white">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 stroke-cyan-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-display font-medium text-slate-100 tracking-tight">Cargando Prontera Sandbox...</h2>
          <p className="text-sm font-mono text-slate-400 mt-2">Iniciando shaders y buffers de vectores...</p>
        </div>
      </div>
    );
  }

  const jobColors: Record<JobClass, string> = {
    'Lord Knight': 'from-rose-500 to-red-700',
    'High Priest': 'from-emerald-400 to-teal-700',
    'Assassin Cross': 'from-fuchsia-500 to-purple-800',
    'Sniper': 'from-sky-400 to-cyan-700'
  };

  const jobAura: Record<JobClass, string> = {
    'Lord Knight': 'shadow-rose-500/20 border-rose-500/40',
    'High Priest': 'shadow-emerald-500/20 border-emerald-500/40',
    'Assassin Cross': 'shadow-fuchsia-500/20 border-fuchsia-500/40',
    'Sniper': 'shadow-sky-500/20 border-sky-500/30'
  };

  const hpPercent = (store.currentHp / store.stats.maxHp) * 100;
  const spPercent = (store.currentSp / store.stats.maxSp) * 100;
  const baseExpPercent = (store.playerBaseExp / store.playerBaseMaxExp) * 100;
  const jobExpPercent = (store.playerJobExp / store.playerJobMaxExp) * 100;

  return (
    <div className="relative w-full h-screen select-none overflow-hidden bg-[#020617] font-sans">
      
      {/* 1. THREE JS CENTRAL CONTAINER */}
      <div 
        ref={containerRef} 
        className="absolute inset-0 w-full h-full z-0 pointer-events-auto"
        id="game-canvas-3d"
      />

      {/* 1.1. BATTLE MODE DANGER PULSING VIGNETTE */}
      <AnimatePresence>
        {store.battleMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            className="absolute inset-[10px] sm:inset-[20px] z-[1] border-[10px] sm:border-[16px] border-red-600/15 pointer-events-none select-none rounded-[1.6rem] sm:rounded-[2.2rem] shadow-[inset_0_0_60px_rgba(220,38,38,0.3)]"
          />
        )}
      </AnimatePresence>

      {/* VIRTUAL JOYSTICK POSITION INDICATOR (Dynamic absolute placement during drag) */}
      {store.isJoystickEnabled && store.joystick.isActive && (
        <div 
          className="absolute z-10 pointer-events-none flex items-center justify-center"
          style={{
            left: `${store.joystick.startX - 60}px`,
            top: `${store.joystick.startY - 60}px`,
            width: '120px',
            height: '120px'
          }}
        >
          {/* Base ring */}
          <div className="absolute w-full h-full rounded-full border-2 border-cyan-500/30 bg-cyan-950/20 backdrop-blur-xs animate-pulse" />
          {/* Inner limit dot ring */}
          <div className="absolute w-1/2 h-1/2 rounded-full border border-dashed border-cyan-400/25" />
          {/* Active Knob */}
          <div 
            className="absolute w-12 h-12 rounded-full bg-linear-to-b from-cyan-400 to-cyan-600 shadow-lg shadow-cyan-500/50 flex items-center justify-center border border-white/20"
            style={{
              transform: `translate(${Math.cos(store.joystick.angle) * store.joystick.distance}px, ${Math.sin(store.joystick.angle) * store.joystick.distance}px)`
            }}
          >
            <div className="w-4 h-4 rounded-full bg-white/70" />
          </div>
        </div>
      )}

      {/* 2. DYNAMIC TARGET MOB HEALTH STATUS BAR (Top Center) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-sm px-4 pointer-events-none">
        <AnimatePresence>
          {store.targetEntityId && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="bg-[#0f172aa0] backdrop-blur-md border border-red-500/30 rounded-xl p-3 shadow-xl flex items-center space-x-3 pointer-events-auto shadow-red-950/20"
              id="mob-target-banner"
            >
              {/* Target Class Logo */}
              <div className="w-10 h-10 rounded-lg bg-red-950/40 border border-red-500/40 flex items-center justify-center shrink-0">
                <Swords className="w-5 h-5 stroke-red-400 animate-pulse" />
              </div>

              {/* Title & Bars */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-display font-medium text-xs text-red-100 tracking-tight block truncate uppercase">
                    {store.targetName}
                  </span>
                  <span className="font-mono text-[10px] text-red-400 font-bold shrink-0">
                    {store.targetHp} / {store.targetMaxHp} HP
                  </span>
                </div>
                
                {/* Hp bar */}
                <div className="w-full h-2.5 bg-red-950/50 rounded-full overflow-hidden border border-red-900/30">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, (store.targetHp / store.targetMaxHp) * 100))}%` }}
                    transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                    className="h-full rounded-full bg-linear-to-r from-red-500 to-rose-600 shadow-inner"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. HERO CORNER IDENTITY HUD (Top Left) */}
      <div className="absolute top-4 left-4 z-10 w-full max-w-[280px] pointer-events-none">
        <div className={`bg-[#0b1329c0] backdrop-blur-md border rounded-2xl p-4 shadow-xl pointer-events-auto ${jobAura[store.jobClass]} transition-all duration-300`}>
          <div className="flex items-center space-x-3 mb-3">
            {/* Avatar block */}
            <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${jobColors[store.jobClass]} p-0.5 flex items-center justify-center shrink-0 shadow-lg border border-white/20 relative overflow-hidden group`}>
              <span className="font-display text-lg font-bold text-white z-10">L.{store.stats.level}</span>
              {/* Cute shimmer shine block on avatar */}
              <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </div>

            {/* Profile info name */}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-sm font-bold text-slate-100 truncate flex items-center tracking-tight">
                {store.stats.level === 99 ? '★ ' : ''}Rookie Hero
              </h1>
              <p className="font-mono text-[11px] text-sky-400 font-semibold">{store.jobClass} | Job L.{store.stats.jobLevel}</p>
            </div>
          </div>

          {/* HP Bar */}
          <div className="space-y-1.5 mb-2.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-emerald-400 font-bold flex items-center"><Heart className="w-3 h-3 stroke-emerald-400 fill-emerald-500/20 mr-1 shrink-0" /> HP</span>
              <span className="text-emerald-200">{Math.floor(store.currentHp)} / {store.stats.maxHp}</span>
            </div>
            <div className="h-2 bg-emerald-950/50 rounded-full overflow-hidden border border-emerald-900/40">
              <div 
                className="h-full rounded-full bg-linear-to-r from-emerald-500 to-teal-500 transition-all duration-300 shadow-inner"
                style={{ width: `${Math.min(100, hpPercent)}%` }}
              />
            </div>
          </div>

          {/* SP Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-sky-400 font-bold flex items-center"><Zap className="w-3 h-3 stroke-sky-400 fill-sky-500/10 mr-1 shrink-0" /> SP</span>
              <span className="text-sky-200">{Math.floor(store.currentSp)} / {store.stats.maxSp}</span>
            </div>
            <div className="h-2 bg-sky-950/50 rounded-full overflow-hidden border border-sky-900/40">
              <div 
                className="h-full rounded-full bg-linear-to-r from-sky-400 to-indigo-500 transition-all duration-300 shadow-inner"
                style={{ width: `${Math.min(100, spPercent)}%` }}
              />
            </div>
          </div>

          {/* Dynamic Combat State Badge */}
          <AnimatePresence>
            {store.battleMode && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-center space-x-1.5 bg-red-950/70 border border-red-500/30 text-red-400 font-mono font-bold text-[9px] py-1 rounded-lg shadow-sm animate-pulse">
                  <Swords className="w-3 h-3 text-red-500 shrink-0" />
                  <span>MODO COMBATE ACTIVO</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 4. CONFIGURATION ACCESS BUTTON (Top Right) */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        {/* Setup and Config drawer trigger buttons */}
        <button 
          onClick={store.toggleConfigPanel}
          className="bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 p-2.5 rounded-xl shadow-lg hover:shadow-cyan-500/10 pointer-events-auto hover:border-slate-500 text-slate-300 hover:text-white transition-all transform hover:scale-105 cursor-pointer"
          title="Configuración de Inputs"
          id="config-sidebar-btn"
        >
          <Settings className="w-4 h-4 shrink-0" />
        </button>
      </div>

      {/* 5. CONFIG SYSTEM PANEL DRAWERS OVERLAY */}
      <AnimatePresence>
        {store.showConfigPanel && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="absolute top-20 right-4 z-20 w-80 max-h-[82vh] bg-[#0f172ae8] backdrop-blur-lg border border-slate-800 p-5 rounded-2xl shadow-2xl overflow-y-auto"
            id="configurator-drawer"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-sm font-display font-medium text-slate-200 tracking-tight flex items-center">
                <Layers className="w-4 h-4 mr-2 stroke-cyan-400" /> Configuración de Entrada
              </h2>
              <button 
                onClick={store.toggleConfigPanel}
                className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-slate-800 transition"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4">
              {/* Virtual Joystick switch */}
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Joystick Virtual</span>
                  <span className="text-[10px] text-slate-400">Pad móvil del lateral izquierdo</span>
                </div>
                <button 
                  onClick={() => store.setJoystickEnabled(!store.isJoystickEnabled)}
                  className={`w-12 h-6.5 rounded-full p-1 transition-all ${store.isJoystickEnabled ? 'bg-cyan-500' : 'bg-slate-700'} relative flex items-center`}
                  id="joystick-toggle"
                >
                  <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-all ${store.isJoystickEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* ACTIVE JOB CLASS CHANGE PANEL (No web forms, clean cards clicks!) */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 block tracking-wider uppercase mb-1">Clase de Personaje</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['Lord Knight', 'High Priest', 'Assassin Cross', 'Sniper'] as JobClass[]).map((job) => (
                    <button
                      key={job}
                      onClick={() => store.setJobClass(job)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        store.jobClass === job 
                          ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-950/20 font-bold text-white' 
                          : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-[11px] block">{job}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Equippable Headgear picker */}
              <div className="space-y-1.5 pt-1.5">
                <span className="text-xs font-bold text-slate-400 block tracking-wider uppercase mb-1">Sombreros Prontera</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'bunny_band', name: 'Orejas Conejo' },
                    { id: 'ragnarok_crown', name: 'Corona Dorada' },
                    { id: 'magician_hat', name: 'Gorro Mago' },
                    { id: 'goggles', name: 'Antiparras Steam' }
                  ].map((gear) => (
                    <button
                      key={gear.id}
                      onClick={() => store.setHeadgear(gear.id as HeadgearId)}
                      className={`p-2 rounded-xl border text-left transition-all text-[11px] ${
                        store.headgear === gear.id
                          ? 'bg-indigo-950/40 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}
                    >
                      {gear.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive guidelines help box */}
              <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-1.5 text-xs text-cyan-300">
                <div className="flex items-center font-bold">
                  <HelpCircle className="w-3.5 h-3.5 mr-1.5 stroke-cyan-400 shrink-0" /> Instrucciones Móviles
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-cyan-400">
                  <li>Toca el terreno para desplazarte.</li>
                  <li>Toca un monstruo para asestar ataques automáticos consecutivos.</li>
                  <li>Usa las burbujas hotkeys de la derecha para encolar habilidades instantáneas.</li>
                  <li>Multitouch activado: mueve personaje mientras realizas disparos/heals en paralelo.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. ADVANCED MULTITOUCH GAMEPAD OVERLAYS (Bottom Margin Panels) */}
      {/* Right-Hand Attack Bubble Controls */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end space-y-4 pointer-events-none">
        
        {/* Potions hotkey (Clean bubble design) */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          {/* Potion inventory count sticker */}
          <span className="font-mono text-[9px] bg-red-950 text-red-400 border border-red-500/30 font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
            x{store.potCount} Red Potion
          </span>
          <button 
            onClick={() => store.addToInputBuffer({ type: 'potion' })}
            className="w-12 h-12 rounded-full bg-linear-to-b from-red-500 to-rose-700 hover:from-red-400 hover:to-rose-600 shadow-lg active:scale-95 transition-all text-white border border-white/20 flex items-center justify-center cursor-pointer"
            id="drink-pot-btn"
          >
            <FlaskConical className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Skill bubbled list (Assures lightning speed execution, no form patterns!) */}
        <div className="flex items-center space-x-3 pointer-events-auto">
          {store.skills.map((skill) => {
            const lastCast = skill.lastCastTime || 0;
            const elapsed = currentTime - lastCast;
            const cooldown = skill.cooldown;
            const isOnCooldown = elapsed < cooldown;
            const degreesRemaining = isOnCooldown ? ((cooldown - elapsed) / cooldown) * 360 : 0;

            return (
              <div key={skill.id} className="relative flex flex-col items-center">
                {/* Floating SP Cost tag */}
                <div className="absolute -top-1.5 -right-1 font-mono text-[8px] bg-slate-900 border border-slate-700 text-slate-300 px-1 rounded-sm z-20">
                  SP {skill.spCost}
                </div>
                
                <button
                  onClick={() => store.castSkill(skill.id)}
                  disabled={isOnCooldown || !!(store.activeCast && skill.castTime && skill.castTime > 0)}
                  className="relative overflow-hidden w-14 h-14 rounded-full border border-white/20 hover:border-white shadow-lg active:scale-90 select-none flex flex-col items-center justify-center text-white font-bold cursor-pointer"
                  style={{ backgroundColor: skill.color }}
                  id={`skill-bubble-${skill.id}`}
                >
                  {/* Cooldown shutter sweep overlay */}
                  {isOnCooldown && (
                    <div 
                      className="absolute inset-0 bg-slate-950/80 z-[1]"
                      style={{
                        background: `conic-gradient(rgba(15, 23, 42, 0.85) ${degreesRemaining}deg, transparent ${degreesRemaining}deg)`
                      }}
                    />
                  )}

                  {/* Cooldown countdown counter label */}
                  {isOnCooldown && (
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-center text-[10px] text-yellow-300 font-extrabold z-[2] select-none bg-slate-950/20 rounded-full">
                      {((cooldown - elapsed) / 1000).toFixed(1)}s
                    </span>
                  )}

                  <span className={`text-[11px] block leading-tight tracking-tight mt-0.5 relative z-[2] ${isOnCooldown ? 'opacity-35' : ''}`}>{skill.name}</span>
                  <span className={`text-[8px] text-white/55 block uppercase font-mono mt-0.5 relative z-[2] ${isOnCooldown ? 'opacity-35' : ''}`}>{skill.key}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6.5. HIGH FIDELITY SPELL CAST CHANTING BAR */}
      <AnimatePresence>
        {store.activeCast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.82, y: -10, x: '-50%' }}
            className="absolute bottom-36 left-1/2 z-20 w-72 bg-slate-950/95 border border-emerald-500/40 backdrop-blur-md rounded-xl p-3 shadow-[0_0_20px_rgba(16,185,129,0.22)] pointer-events-none select-none"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase flex items-center">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-2 animate-ping shrink-0" />
                CHANTEANDO: {store.activeCast.skillName}
              </span>
              <span className="text-[9px] font-mono font-extrabold text-emerald-300">
                {Math.max(0, (store.activeCast.durationMs - store.activeCast.elapsedMs) / 1000).toFixed(1)}s
              </span>
            </div>
            
            {/* Visual Progress Track */}
            <div className="w-full h-2.5 bg-slate-900 rounded-lg overflow-hidden border border-emerald-500/10 p-0.5">
              <div 
                className="h-full rounded-md shadow-[0_0_8px_rgba(16,185,129,0.4)] transition-all duration-[33ms] ease-out"
                style={{ 
                  width: `${Math.min(100, (store.activeCast.elapsedMs / store.activeCast.durationMs) * 100)}%`,
                  backgroundColor: store.activeCast.color || '#10b981'
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. DYNAMIC LIVE INPUT BUFFER MONITOR QUEUE (Bottom Center) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-sm px-4 pointer-events-none hidden">
        <div className="bg-[#0f172ad0] backdrop-blur-md border border-slate-800/80 rounded-2xl p-3 shadow-xl pointer-events-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono font-bold text-slate-400 block tracking-widest uppercase flex items-center">
              <FastForward className="w-3 h-3 mr-1.5 stroke-cyan-400 fill-cyan-400/10 shrink-0" /> Buffer de Input
            </span>
            <span className="text-[8px] font-mono font-bold text-slate-500">Expiración: ~1200ms</span>
          </div>

          <div className="flex items-center space-x-1.5 min-h-[32px] bg-slate-950/50 p-1.5 rounded-lg border border-slate-900 overflow-x-auto">
            {store.bufferingQueue.length === 0 ? (
              <span className="text-[10px] font-mono text-slate-500 italic mx-auto">Esperando comandos de toque...</span>
            ) : (
              store.bufferingQueue.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className={`px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold shrink-0 flex items-center ${
                    item.type === 'skill' 
                      ? 'bg-purple-950/60 border-purple-800 text-purple-300' 
                      : item.type === 'potion' 
                      ? 'bg-red-950/60 border-red-800 text-red-300'
                      : item.type === 'target' 
                      ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                      : 'bg-sky-950/60 border-sky-800 text-sky-300'
                  }`}
                >
                  <span className="uppercase">{item.type}</span>
                  {item.skillId && <span className="ml-1 opacity-70">({item.skillId})</span>}
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 8. COMBAT LOG STREAM LOGGER (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-10 w-full max-w-[260px] hidden md:block pointer-events-none">
        <div className="bg-[#0b0f19c8] backdrop-blur-md border border-slate-900 p-3 rounded-2xl shadow-xl pointer-events-auto h-40 overflow-hidden relative">
          <div className="absolute inset-x-0 bottom-0 top-6 bg-linear-to-b from-transparent via-[#0b0f1902] to-[#0b0f19] pointer-events-none z-1" />
          <span className="text-[9px] font-mono font-bold text-slate-400 block tracking-widest uppercase mb-1.5 border-b border-slate-900 pb-1 flex items-center">
            <Info className="w-3 h-3 mr-1 stroke-slate-400 shrink-0" /> Bitácora de Batalla
          </span>

          <div className="space-y-1.5 overflow-y-auto h-[105px] pr-1 select-text">
            {store.combatLogs.map((log) => (
              <div key={log.id} className="text-[10px] font-mono leading-normal leading-normal">
                <span className="text-slate-600 block mr-1 select-none shrink-0 text-[8px] float-left pt-0.5 font-bold">[{log.timestamp}]</span>
                <span className={
                  log.type === 'system' ? 'text-slate-400' :
                  log.type === 'mvp' ? 'text-yellow-400 font-bold' :
                  log.type === 'loot' ? 'text-cyan-400 font-bold' :
                  log.type === 'heal' ? 'text-emerald-400' :
                  log.type === 'skill' ? 'text-purple-400' :
                  log.type === 'player_hit' ? 'text-rose-400' : 'text-red-400'
                }>
                  {log.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 9. EXPERIENCE STATS BOTTOM GAUGE RAIL */}
      <div className="absolute bottom-0 inset-x-0 h-1 z-10 flex flex-col">
        {/* Base EXP gauge bar */}
        <div className="h-0.5 bg-slate-950 flex">
          <div 
            className="h-full bg-cyan-400 shadow-xs transition-all duration-300"
            style={{ width: `${baseExpPercent}%` }}
            title={`Base EXP: ${store.playerBaseExp} / ${store.playerBaseMaxExp} (${Math.round(baseExpPercent)}%)`}
          />
        </div>
        {/* Job EXP gauge bar */}
        <div className="h-0.5 bg-slate-900 flex">
          <div 
            className="h-full bg-emerald-400 shadow-xs transition-all duration-300"
            style={{ width: `${jobExpPercent}%` }}
            title={`Job EXP: ${store.playerJobExp} / ${store.playerJobMaxExp} (${Math.round(jobExpPercent)}%)`}
          />
        </div>
      </div>

      {/* 11. RETRO RAGNAROK NPC DIALOGUE OVERLAY */}
      <AnimatePresence>
        {store.npcDialogue && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 md:left-auto md:right-12 md:-translate-x-0 z-20 w-[92%] max-w-md pointer-events-auto"
            id="npc-dialogue-modal"
          >
            {/* Main Rag Blue-Silver themed Window */}
            <div className="bg-[#e2ebf5df] backdrop-blur-md rounded-lg shadow-2xl border-2 border-slate-400 overflow-hidden text-slate-800 font-sans p-4.5 relative">
              {/* NPC Name Title Header Banner */}
              <div className="flex items-center space-x-2 bg-linear-to-r from-[#2c4f82] to-[#122542] text-white px-3 py-1.5 rounded-t-lg -mt-4.5 -mx-4.5 mb-3.5 border-b-2 border-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span className="font-display font-bold text-xs tracking-wider uppercase">{store.npcDialogue.npcName}</span>
                <span className="text-[9px] font-mono text-slate-300 ml-auto uppercase opacity-75">Interacción activa</span>
              </div>

              {/* Dialogue Main Text paragraph */}
              <div className="bg-white/80 border border-slate-300 rounded-md p-3 text-xs leading-relaxed font-medium mb-4 text-slate-800">
                {store.npcDialogue.text}
              </div>

              {/* Options vertical pile */}
              <div className="space-y-1.5">
                {store.npcDialogue.options.map((opt, i) => (
                  <button
                    key={`${i}_${opt.actionParam}`}
                    onClick={() => {
                      if (engineRef.current) {
                        engineRef.current.handleNpcAction(store.npcDialogue!.npcId, opt.actionParam);
                      }
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-md text-xs font-bold bg-[#cbd5e1af] hover:bg-[#b0c4de] active:scale-[0.98] border border-slate-400/50 hover:border-slate-400 text-slate-900 transition-all select-none cursor-pointer flex items-center shadow-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-200/50 dark:bg-[#2c4f82]/10 border border-slate-400 text-slate-700 font-mono text-[9px] flex items-center justify-center mr-3 font-black">{i + 1}</span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 10. RESURRECTION MODAL POPUP IF FALLEN */}
      <AnimatePresence>
        {store.currentHp <= 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-30 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6.5 max-w-sm w-full text-center shadow-2xl relative overflow-hidden shadow-red-950/30"
            >
              {/* Decorative aura */}
              <div className="absolute -top-12 -left-12 w-24 h-24 rounded-full bg-red-500/10 blur-xl" />
              <div className="absolute -bottom-12 -right-12 w-24 h-24 rounded-full bg-red-500/10 blur-xl" />

              <AlertTriangle className="w-12 h-12 stroke-red-500 mx-auto mb-4 animate-bounce" />
              
              <h2 className="text-lg font-display font-medium text-slate-100 tracking-tight">¡Has caído en Prontera!</h2>
              <p className="text-xs text-slate-400 mt-2 font-mono leading-relaxed leading-relaxed">
                El boss MVP Baphomet o las hordas del pantano han superado tu temple. Tus items están asegurados contra pérdidas de loot.
              </p>

              {/* Action revives instantly */}
              <button
                onClick={() => {
                  if (engineRef.current) {
                    engineRef.current.revivePlayer();
                  }
                }}
                className="mt-6 w-full py-3 px-4 rounded-xl font-bold bg-linear-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-lg active:scale-95 transition-all text-sm select-none cursor-pointer border border-white/10"
                id="resurrect-trigger"
              >
                Volver a vivir en Prontera
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
