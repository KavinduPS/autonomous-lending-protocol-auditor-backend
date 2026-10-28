const usedPorts = new Set<number>();
const PORT_RANGE_START = 9000;
const PORT_RANGE_END = 9999;

export function allocatePort(): number {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error(
    `No free ports available in range ${PORT_RANGE_START}-${PORT_RANGE_END}`,
  );
}

export function releasePort(port: number): void {
  usedPorts.delete(port);
}
