"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft, Usb, Unplug, Zap, Download, Upload, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PropertyDef, TribunusDevice } from "@cmuav/sproto-protocol";
import {
  TribunusSystemProps, TribunusStateProps, TribunusSettingsProps,
  TRIBUNUS_SYSTEM_REGION, TRIBUNUS_STATE_REGION, TRIBUNUS_SETTINGS_REGION,
  DeviceModes, Protocols,
  RotationDirections, PwmModes, IGainCorrections,
  extractBits,
} from "@cmuav/sproto-protocol";

type ConnectionState = "disconnected" | "connecting" | "connected" | "lost";

// ── Enum labels (Tribunus III) ───────────────────────────────────────────────

const ENUM_LABELS: Record<string, Record<number, string>> = {
  DeviceModes: Object.fromEntries(Object.entries(DeviceModes).map(([k, v]) => [v, k.replace(/_/g, " ")])),
  BecVoltages: { 0: "5.0V", 1: "6.2V", 2: "7.2V", 3: "8.4V", 4: "8.8V", 5: "10.0V", 6: "11.0V", 7: "12.1V", 8: "Disabled" },
  Protocols: Object.fromEntries(Object.entries(Protocols).map(([k, v]) => [v, k.replace(/_/g, " ")])),
  RotationDirections: Object.fromEntries(Object.entries(RotationDirections).map(([k, v]) => [v, k])),
  PwmModes: Object.fromEntries(Object.entries(PwmModes).map(([k, v]) => [v, k.replace(/_/g, " ")])),
  IGainCorrections: Object.fromEntries(Object.entries(IGainCorrections).map(([k, v]) => [v, k])),
};

// ── Value reading/writing ───────────────────────────────────────────────────

function readRaw(data: Uint8Array, offset: number, size: number): number {
  if (size === 1) return data[offset];
  if (size === 2) return data[offset] | (data[offset + 1] << 8);
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function byteSize(type: string, size?: number): number {
  if (type === "ascii") return size ?? 1;
  if (type === "uint8" || type === "int8") return 1;
  if (type === "uint32" || type === "int32" || type === "iq22") return 4;
  return 2;
}

function readProp(data: Uint8Array, p: PropertyDef): number | string {
  if (p.type === "ascii") {
    let s = "";
    for (let i = 0; i < (p.size ?? 1); i++) {
      const b = data[p.offset + i];
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  let raw = readRaw(data, p.offset, byteSize(p.type, p.size));
  if (p.mask !== undefined) raw = raw & p.mask;
  if (p.bits) raw = extractBits(raw, p.bits[0], p.bits[1]);

  switch (p.type) {
    case "int16": { const v = raw & 0xffff; return (v > 32767 ? v - 65536 : v) / (p.div ?? 1); }
    case "int32": return (raw | 0) / (p.div ?? 1);
    case "sprc":
    case "smeas": { const v = raw & 0xffff; return (v > 32767 ? v - 65536 : v) / (100 * (p.div ?? 1)); }
    case "iq22": return ((raw | 0) / (1 << 22)) / (p.div ?? 1);
    default: return raw / (p.div ?? 1);
  }
}

function formatProp(value: number | string, p: PropertyDef, key: string): string {
  if (typeof value === "string") return value;
  if (p.enumName && ENUM_LABELS[p.enumName]) return ENUM_LABELS[p.enumName][value] ?? String(value);
  if (key === "serialNumber") return value.toString(16).toUpperCase().padStart(8, "0");
  if (p.type === "iq22") return value.toFixed(3);
  if (p.type === "sprc" || p.type === "smeas") return value.toFixed(2);
  if (p.div && p.div > 1) return value.toFixed(2);
  return String(value);
}

function writeProp(data: Uint8Array, p: PropertyDef, input: string): Uint8Array {
  const next = new Uint8Array(data);
  if (p.type === "ascii") {
    const len = p.size ?? 1;
    for (let i = 0; i < len; i++) next[p.offset + i] = i < input.length ? input.charCodeAt(i) : 0;
    return next;
  }
  const num = parseFloat(input);
  if (isNaN(num)) return next;

  let raw: number;
  switch (p.type) {
    case "sprc": case "smeas": raw = Math.round(num * 100 * (p.div ?? 1)); if (raw < 0) raw += 65536; break;
    case "iq22": raw = Math.round(num * (p.div ?? 1) * (1 << 22)); break;
    case "int16": raw = Math.round(num * (p.div ?? 1)); if (raw < 0) raw += 65536; break;
    case "int32": raw = Math.round(num * (p.div ?? 1)); break;
    default: raw = Math.round(num * (p.div ?? 1)); break;
  }

  const sz = byteSize(p.type, p.size);
  next[p.offset] = raw & 0xff;
  if (sz >= 2) next[p.offset + 1] = (raw >> 8) & 0xff;
  if (sz >= 4) { next[p.offset + 2] = (raw >> 16) & 0xff; next[p.offset + 3] = (raw >> 24) & 0xff; }
  return next;
}

// ── Property entries ────────────────────────────────────────────────────────

interface PropEntry { key: string; name: string; def: PropertyDef; options?: { label: string; value: number }[] }

function buildEnumOptions(enumName: string): { label: string; value: number }[] {
  const map = ENUM_LABELS[enumName];
  if (!map) return [];
  return Object.entries(map).map(([v, label]) => ({ value: Number(v), label }));
}

const SYSTEM_NAMES: Record<string, string> = {
  serialNumber: "Serial Number", deviceType: "Device Type", bootloaderVersion: "Bootloader",
  firmwareVersion: "Firmware", resetCode: "Reset Code", logSize: "Log Size",
};

const STATE_NAMES: Record<string, string> = {
  activeTime: "Active Time", throttle: "Throttle", current: "Current",
  batVolt: "Battery Voltage", consumption: "Consumption", mosfetTemp: "MOSFET Temp",
  outputPower: "Output Power", becVolt: "BEC Voltage", motorRPM: "Motor ERPM",
  errors: "Error Flags", cpuTemp: "CPU Temp", timingAdv: "Timing Advance",
};

const SETTINGS_NAMES: Record<string, string> = {
  deviceName: "Device Name", mode: "Device Mode", becVoltage: "BEC Voltage",
  rotationDirection: "Rotation", protocol: "Protocol", fanOnTemperature: "Fan On Temp",
  startTime: "Start Time", rampTime: "Ramp Time", bailoutTime: "Bailout Time",
  pGain: "P Gain", iGain: "I Gain", dGain: "D Gain",
  iGainCorrection: "I Gain Correction", storedRpm: "Stored RPM",
  dragBrake: "Drag Brake", acceleration: "Acceleration", pwmMode: "PWM Mode",
  cutoffDelay: "Cutoff Delay", minVoltage: "Min Voltage", maxTemperature: "Max Temp",
  maxCurrent: "Max Current", cutoffPower: "Cutoff Power", maxConsumption: "Battery Capacity",
  protectionMargin: "Safety Margin", voltageLimitMode: "Voltage Limit Mode",
  voltageLimit: "Voltage Limit",
  soundConfiguration: "Sound Volume", gearRatio: "Gear Ratio", polePairs: "Pole Pairs",
  sensitivityGain: "Sensitivity Gain", rpmCorrection: "RPM Correction",
  minThrottle: "Min Throttle", zeroThrottle: "Zero Throttle", maxThrottle: "Max Throttle",
  cpuTempLogging: "CPU Temp Logging", telemetryId: "Telemetry ID",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function TribunusIIIPage() {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("");

  const [systemData, setSystemData] = useState<Uint8Array | null>(null);
  const [stateData, setStateData] = useState<Uint8Array | null>(null);
  const [settingsData, setSettingsData] = useState<Uint8Array | null>(null);
  const [origSettings, setOrigSettings] = useState<Uint8Array | null>(null);

  const [webUsbSupported] = useState(() => typeof window !== "undefined" && "usb" in navigator);

  const SYSTEM_ENTRIES = useMemo(() =>
    Object.entries(TribunusSystemProps as unknown as Record<string, PropertyDef>).map(([key, def]) => ({
      key, name: SYSTEM_NAMES[key] ?? key, def,
      options: def.enumName ? buildEnumOptions(def.enumName) : undefined,
    })), []);

  const STATE_ENTRIES = useMemo(() =>
    Object.entries(TribunusStateProps as unknown as Record<string, PropertyDef>).map(([key, def]) => ({
      key, name: STATE_NAMES[key] ?? key, def,
    })), []);

  const SETTINGS_ENTRIES = useMemo(() => {
    const allProps = TribunusSettingsProps as unknown as Record<string, PropertyDef>;
    return Object.keys(allProps).map((key: string) => ({
      key, name: SETTINGS_NAMES[key] ?? key, def: allProps[key],
      options: allProps[key].enumName ? buildEnumOptions(allProps[key].enumName!) : undefined,
    }));
  }, []);

  const tribRef = useRef<TribunusDevice | null>(null);
  const portRef = useRef<unknown>(null);
  const transportRef = useRef<{ release(): Promise<void> } | null>(null);

  useEffect(() => { return () => { doDisconnect(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function isDisconnectError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      msg.includes("disconnected") ||
      msg.includes("device has been lost") ||
      msg.includes("The device has been lost") ||
      msg.includes("EPIPE") ||
      msg.includes("A transfer error") ||
      msg.includes("Port is not readable") ||
      msg.includes("Port is not writable") ||
      msg.includes("Port closed")
    );
  }

  function handleLost(errorMsg?: string) {
    setLoading(false); setLoadingLabel("");
    setError(errorMsg ?? "Device disconnected. Reconnect the USB cable and try again.");
    setState("lost");
    if (transportRef.current) { try { transportRef.current.release(); } catch {} transportRef.current = null; }
    if (portRef.current) { try { (portRef.current as { close(): Promise<void> }).close(); } catch {} portRef.current = null; }
    tribRef.current = null;
  }

  const doDisconnect = async () => {
    if (transportRef.current) { try { await transportRef.current.release(); } catch {} transportRef.current = null; }
    if (portRef.current) { try { await (portRef.current as { close(): Promise<void> }).close(); } catch {} portRef.current = null; }
    tribRef.current = null;
  };

  const connect = useCallback(async () => {
    setError(null); setState("connecting");
    try {
      const { createTribunusDevice } = await import("@cmuav/sproto-protocol");
      const { WebSerialSprotoTransport } = await import("@/lib/sproto-transport");
      const { serial } = await import("@cmuav/web-serial-polyfill");

      const port = await serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 38400 });
      await new Promise((r) => setTimeout(r, 500));

      const transport = new WebSerialSprotoTransport(port);
      transportRef.current = transport;
      transport.onDisconnect = () => handleLost();

      tribRef.current = createTribunusDevice(transport);
      setState("connected");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("No device selected") || msg.includes("cancelled")) { setState("disconnected"); return; }
      setError(msg); setState("disconnected");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnect = useCallback(async () => {
    await doDisconnect(); setError(null); await connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  const disconnect = useCallback(async () => {
    await doDisconnect(); setState("disconnected"); setSystemData(null); setStateData(null); setSettingsData(null); setOrigSettings(null); setError(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readAll = useCallback(async () => {
    const trib = tribRef.current; if (!trib) return;
    setLoading(true); setError(null);
    try {
      setLoadingLabel("Reading system...");
      await trib.device.readRegion(trib.regions.system, undefined, undefined, (p) => setProgress(p * 0.2));
      setSystemData(trib.regions.system.readRaw(0, TRIBUNUS_SYSTEM_REGION.length));

      setLoadingLabel("Reading state...");
      await trib.device.readRegion(trib.regions.state, undefined, undefined, (p) => setProgress(20 + p * 0.2));
      setStateData(trib.regions.state.readRaw(0, TRIBUNUS_STATE_REGION.length));

      setLoadingLabel("Reading settings...");
      await trib.device.readRegion(trib.regions.settings, undefined, undefined, (p) => setProgress(40 + p * 0.6));
      const sd = trib.regions.settings.readRaw(0, TRIBUNUS_SETTINGS_REGION.length);
      setSettingsData(sd); setOrigSettings(new Uint8Array(sd));
    } catch (e: unknown) {
      if (isDisconnectError(e)) { handleLost(); return; }
      setError(`Read failed: ${e instanceof Error ? e.message : e}`);
    } finally { setLoading(false); setLoadingLabel(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeSettings = useCallback(async () => {
    const trib = tribRef.current;
    if (!trib || !settingsData) return;
    setLoading(true); setError(null); setLoadingLabel("Writing settings...");
    try {
      trib.regions.settings.writeRaw(0, settingsData);
      await trib.device.writeRegion(trib.regions.settings, undefined, undefined, (p) => setProgress(p));
      setOrigSettings(new Uint8Array(settingsData));
    } catch (e: unknown) {
      if (isDisconnectError(e)) { handleLost(); return; }
      setError(`Write failed: ${e instanceof Error ? e.message : e}`);
    } finally { setLoading(false); setLoadingLabel(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  const refreshState = useCallback(async () => {
    const trib = tribRef.current; if (!trib) return;
    try {
      await trib.device.readRegion(trib.regions.state);
      setStateData(trib.regions.state.readRaw(0, TRIBUNUS_STATE_REGION.length));
    } catch (e: unknown) {
      if (isDisconnectError(e)) handleLost();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = settingsData && origSettings && !settingsData.every((v, i) => v === origSettings[i]);

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 bg-card/80 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold flex-1">Tribunus III ESC</h1>
          {state === "connected" && <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-green-500" /><span className="text-xs text-muted-foreground">Connected</span></div>}
          {state === "lost" && <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-xs text-red-500">Disconnected</span></div>}
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto flex flex-col gap-4">
        {!webUsbSupported && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-semibold text-red-700">WebUSB not supported. Use Chrome or Edge.</p>
          </div>
        )}

        {/* Connection */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Tribunus III ESC</p>
              <p className="text-xs text-muted-foreground">
                {state === "disconnected" && "Connect via USB-serial adapter"}
                {state === "connecting" && "Opening port..."}
                {state === "connected" && !settingsData && "Connected \u2014 read config"}
                {state === "connected" && settingsData && "Config loaded"}
                {state === "lost" && "Connection lost \u2014 reconnect to continue"}
              </p>
            </div>
          </div>
          {state === "disconnected" ? (
            <Button className="w-full h-12 text-base font-semibold rounded-xl" onClick={connect} disabled={!webUsbSupported}>
              <Usb className="h-4 w-4 mr-2" /> Connect
            </Button>
          ) : state === "connecting" ? (
            <Button className="w-full h-12 rounded-xl" disabled>Connecting...</Button>
          ) : state === "lost" ? (
            <div className="flex gap-2">
              <Button className="flex-1 h-12 text-base font-semibold rounded-xl" onClick={reconnect} disabled={!webUsbSupported}>
                <Usb className="h-4 w-4 mr-2" /> Reconnect
              </Button>
              <Button variant="outline" className="h-12 rounded-xl text-destructive border-destructive/30" onClick={disconnect}>
                <Unplug className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-xl" onClick={readAll} disabled={loading}>
                <Download className="h-4 w-4 mr-2" /> {settingsData ? "Re-read" : "Read"}
              </Button>
              {hasChanges && (
                <Button className="flex-1 h-10 rounded-xl" onClick={writeSettings} disabled={loading}>
                  <Upload className="h-4 w-4 mr-2" /> Write
                </Button>
              )}
              <Button variant="outline" className="h-10 rounded-xl text-destructive border-destructive/30" onClick={disconnect}>
                <Unplug className="h-4 w-4" />
              </Button>
            </div>
          )}
          {loading && (
            <div className="mt-3">
              <div className="flex justify-between mb-1"><p className="text-xs text-muted-foreground">{loadingLabel}</p><p className="text-xs text-muted-foreground tabular-nums">{Math.round(progress)}%</p></div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {error && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3"><p className="text-sm text-red-600">{error}</p></div>}
        </div>

        {/* System Info */}
        {systemData && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">System</p>
            <div className="grid grid-cols-2 gap-2">
              {SYSTEM_ENTRIES.map(({ key, name, def }) => (
                <div key={key} className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{name}</p>
                  <p className="text-sm font-semibold font-mono">{formatProp(readProp(systemData, def), def, key)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Telemetry */}
        {stateData && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Live Telemetry</p>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={refreshState}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STATE_ENTRIES.filter(({ key }) => !["activeTime", "errors"].includes(key)).map(({ key, name, def }) => (
                <div key={key} className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{name}</p>
                  <p className="text-sm font-semibold font-mono">
                    {formatProp(readProp(stateData, def), def, key)}
                    {def.unit ? <span className="text-xs text-muted-foreground ml-1">{def.unit}</span> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        {settingsData && (() => {
          const GROUP_LABELS: Record<string, string> = {
            main: "General", heli: "Helicopter / Governor", plane: "Airplane",
            protection: "Protection", configuration: "Configuration",
          };
          let lastGroup = "";
          return (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Settings</p>
                {hasChanges && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Modified</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {SETTINGS_ENTRIES.map((entry) => {
                  const group = (entry.def as PropertyDef & { group?: string }).group ?? "";
                  const showHeader = group !== lastGroup;
                  lastGroup = group;
                  return (
                    <div key={entry.key}>
                      {showHeader && group && (
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-1.5 px-1">
                          {GROUP_LABELS[group] ?? group}
                        </p>
                      )}
                      <SettingRow entry={entry} data={settingsData} original={origSettings!} onChange={setSettingsData} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({ entry, data, original, onChange }: {
  entry: PropEntry;
  data: Uint8Array;
  original: Uint8Array;
  onChange: (data: Uint8Array) => void;
}) {
  const { key, name, def, options } = entry;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const currentDisplay = formatProp(readProp(data, def), def, key);
  const origDisplay = formatProp(readProp(original, def), def, key);
  const modified = currentDisplay !== origDisplay;

  function commit() {
    if (options) {
      const opt = options.find((o) => o.label === input);
      if (opt) { onChange(writeProp(data, def, String(opt.value))); setEditing(false); return; }
    }
    onChange(writeProp(data, def, input));
    setEditing(false);
  }

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-lg ${modified ? "bg-amber-50 border border-amber-200" : "bg-muted/20"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{name}</p>
      </div>
      {editing ? (
        options ? (
          <select
            className="text-xs font-mono bg-background border rounded px-2 py-1"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={commit}
          >
            {options.map((o) => <option key={o.value} value={o.label}>{o.label}</option>)}
          </select>
        ) : (
          <Input
            className="w-28 h-7 text-xs font-mono text-right"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            onBlur={commit}
          />
        )
      ) : (
        <button
          className={`text-xs font-mono font-medium px-2 py-1 rounded min-w-[60px] text-right ${
            def.readOnly ? "text-muted-foreground bg-muted/30" : "bg-muted/50 hover:bg-muted"
          } ${modified ? "text-amber-700" : ""}`}
          onClick={() => { if (!def.readOnly) { setInput(currentDisplay); setEditing(true); } }}
          disabled={def.readOnly}
        >
          {currentDisplay}{def.unit ? <span className="text-muted-foreground ml-1">{def.unit}</span> : null}
        </button>
      )}
    </div>
  );
}
