# Sproto Web Configurator

Browser-based configuration tool for Tribunus ESCs (II and III series) using the [Sproto serial protocol](https://github.com/cmuav/sproto-reverse) over WebUSB.

**[Open the configurator](https://cmuav.github.io/sproto-web-configurator)**

## Features

- Read, edit, and write ESC settings directly from your browser
- Live telemetry readout (voltage, current, RPM, temperature)
- System info display (serial number, firmware version, bootloader)
- Supports both Tribunus II and Tribunus III ESC families
- Works with PL2303 and CDC-ACM USB-to-serial adapters
- No drivers or desktop software required

## Requirements

- **Chrome or Edge** (WebUSB is not supported in Firefox or Safari)
- A USB-to-serial adapter (PL2303 or CDC-ACM) connected to the ESC programming port

## Development

```bash
npm install
npm run dev
```

## Built with

- [Next.js](https://nextjs.org) (static export)
- [@cmuav/sproto-protocol](https://github.com/cmuav/sproto-reverse) — Sproto protocol implementation
- [@cmuav/web-serial-polyfill](https://github.com/cmuav/web-serial-polyfill) — WebSerial over WebUSB (CDC-ACM + PL2303)

## License

MIT
