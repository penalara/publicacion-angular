export function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function createDebugLogger(log, debug) {
  return (message) => {
    if (debug) log(`[debug] ${message}`);
  };
}
