/**
 * Manages open SSE connections per user.
 * A user may have multiple browser tabs open — all receive events.
 */
import type { Response } from "express";

const connections = new Map<string, Set<Response>>();

export function addConnection(userId: string, res: Response): void {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(res);
}

export function removeConnection(userId: string, res: Response): void {
  connections.get(userId)?.delete(res);
  if (connections.get(userId)?.size === 0) connections.delete(userId);
}

export function pushToUser(userId: string, event: string, data: object): void {
  const conns = connections.get(userId);
  if (!conns?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try {
      res.write(payload);
    } catch {
      conns.delete(res);
    }
  }
}
