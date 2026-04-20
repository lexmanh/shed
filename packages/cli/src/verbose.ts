let _verbose = false;

export function setVerbose(v: boolean): void {
  _verbose = v;
}

export function verbose(msg: string): void {
  if (_verbose) {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    process.stderr.write(`[${ts}] ${msg}\n`);
  }
}
