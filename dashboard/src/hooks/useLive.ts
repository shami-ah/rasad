import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Connect to the Rasad WebSocket and auto-invalidate queries on updates */
export function useLiveUpdates(): void {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect(): void {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string };
          if (msg.type === "session_updated") {
            // Invalidate all queries so dashboard refreshes
            queryClient.invalidateQueries();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [queryClient]);
}
