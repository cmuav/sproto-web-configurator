import type { Transport } from "@cmuav/sproto-protocol";

/** Anything with readable/writable streams (native SerialPort or polyfill). */
interface PortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  addEventListener?: (event: string, handler: () => void) => void;
  removeEventListener?: (event: string, handler: () => void) => void;
}

/**
 * Sproto Transport over any port with ReadableStream/WritableStream.
 * Works with both native WebSerial and the WebUSB serial polyfill.
 *
 * Fires `onDisconnect` when the port is lost (USB unplug, etc.).
 */
export class WebSerialSprotoTransport implements Transport {
  private port: PortLike;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer: number[] = [];
  private timeoutMs: number;
  private _disconnected = false;
  private _disconnectHandler: (() => void) | null = null;

  /** Called when the port disconnects unexpectedly. */
  onDisconnect: (() => void) | null = null;

  constructor(port: PortLike, timeoutMs = 2000) {
    this.port = port;
    this.timeoutMs = timeoutMs;

    // Listen for native WebSerial disconnect events
    if (port.addEventListener) {
      this._disconnectHandler = () => this._handleDisconnect();
      port.addEventListener("disconnect", this._disconnectHandler);
    }
  }

  get disconnected(): boolean {
    return this._disconnected;
  }

  private _handleDisconnect() {
    if (this._disconnected) return;
    this._disconnected = true;
    this.onDisconnect?.();
  }

  async write(data: Uint8Array): Promise<void> {
    if (this._disconnected) throw new Error("Device disconnected");
    try {
      if (!this.writer) {
        if (!this.port.writable) throw new Error("Port is not writable");
        this.writer = this.port.writable.getWriter();
      }
      await this.writer.write(data);
    } catch (e) {
      this._handleDisconnect();
      throw e;
    }
  }

  async read(length: number): Promise<Uint8Array> {
    if (this._disconnected) throw new Error("Device disconnected");
    try {
      if (!this.reader) {
        if (!this.port.readable) throw new Error("Port is not readable");
        this.reader = this.port.readable.getReader();
      }

      const deadline = Date.now() + this.timeoutMs;

      while (this.readBuffer.length < length) {
        if (this._disconnected) throw new Error("Device disconnected");
        if (Date.now() > deadline) {
          throw new Error("Sproto read timeout");
        }

        const result = await Promise.race([
          this.reader.read(),
          sleep(this.timeoutMs).then(() => ({ value: undefined, done: true as const })),
        ]);

        if (result.done || !result.value) {
          this._handleDisconnect();
          throw new Error("Device disconnected");
        }

        this.readBuffer.push(...result.value);
      }

      return new Uint8Array(this.readBuffer.splice(0, length));
    } catch (e) {
      // Detect common disconnect error patterns
      const msg = e instanceof Error ? e.message : "";
      if (
        msg.includes("disconnected") ||
        msg.includes("device has been lost") ||
        msg.includes("EPIPE") ||
        msg.includes("The device has been lost") ||
        msg.includes("A transfer error has occurred")
      ) {
        this._handleDisconnect();
      }
      throw e;
    }
  }

  async clear(): Promise<void> {
    this.readBuffer = [];
  }

  /** Release stream locks and remove event listeners. Call before closing the port. */
  async release(): Promise<void> {
    try { this.writer?.releaseLock(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    if (this._disconnectHandler && this.port.removeEventListener) {
      this.port.removeEventListener("disconnect", this._disconnectHandler);
    }
    this.writer = null;
    this.reader = null;
    this.readBuffer = [];
    this._disconnected = false;
    this._disconnectHandler = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
