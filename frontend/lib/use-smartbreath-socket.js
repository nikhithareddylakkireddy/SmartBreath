import { useEffect, useState } from 'react';

export function useSmartBreathSocket(user) {
  const [status, setStatus] = useState('OFFLINE');
  const [event, setEvent] = useState(null);
  useEffect(() => {
    if (!user || typeof window === 'undefined') return undefined;
    const url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    let socket; let retry; let stopped = false;
    function connect() {
      setStatus('RECONNECTING');
      const query = `schoolId=${encodeURIComponent(user.schoolId)}&userId=${encodeURIComponent(user.sub)}`;
      const protocols = user.accessToken ? [`bearer.${user.accessToken}`] : undefined;
      socket = new WebSocket(`${url}?${query}`, protocols);
      socket.onopen = () => setStatus('LIVE');
      socket.onmessage = (message) => setEvent(JSON.parse(message.data));
      socket.onerror = () => setStatus('OFFLINE');
      socket.onclose = () => { if (!stopped) { setStatus('RECONNECTING'); retry = window.setTimeout(connect, 3000); } else setStatus('OFFLINE'); };
    }
    connect();
    return () => { stopped = true; window.clearTimeout(retry); socket?.close(); };
  }, [user]);
  return { status, event };
}
