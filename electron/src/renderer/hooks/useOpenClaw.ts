/**
 * useOpenClaw Hook
 *
 * Connect to OpenClaw Gateway via WebSocket
 * MVP: Simulated connection
 * TODO: Implement real WebSocket connection
 */

import { useState, useEffect } from 'react';

interface OpenClawState {
  state: 'idle' | 'working' | 'thinking' | 'happy' | 'sleeping';
  message: string;
  connected: boolean;
}

export function useOpenClaw(): OpenClawState {
  const [state, setState] = useState<'idle' | 'working' | 'thinking' | 'happy' | 'sleeping'>('idle');
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // MVP: Simulate connection
    console.log('Connecting to OpenClaw Gateway...');

    const timer = setTimeout(() => {
      setConnected(true);
      setState('idle');
      setMessage('ClawAvatar 已就绪');

      // Simulate state changes
      setTimeout(() => {
        setState('working');
        setMessage('工作中...');
      }, 3000);
    }, 1000);

    return () => clearTimeout(timer);

    // TODO: Implement real WebSocket connection
    // const ws = new WebSocket('ws://127.0.0.1:18789');
    //
    // ws.onopen = () => {
    //   console.log('Connected to OpenClaw Gateway');
    //   setConnected(true);
    //
    //   ws.send(JSON.stringify({
    //     type: 'req',
    //     id: 'handshake',
    //     method: 'connect',
    //     params: { role: 'client', version: '1.0.0' }
    //   }));
    // };
    //
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //
    //   if (data.type === 'event') {
    //     switch (data.event) {
    //       case 'agent':
    //         if (data.payload.status === 'thinking') {
    //           setState('thinking');
    //           setMessage('思考中...');
    //         }
    //         break;
    //       case 'clawavatar.status':
    //         setState(data.payload.state);
    //         setMessage(data.payload.message);
    //         break;
    //     }
    //   }
    // };
    //
    // ws.onerror = (error) => {
    //   console.error('WebSocket error:', error);
    //   setConnected(false);
    // };
    //
    // ws.onclose = () => {
    //   console.log('Disconnected from OpenClaw Gateway');
    //   setConnected(false);
    // };
    //
    // return () => {
    //   ws.close();
    // };
  }, []);

  return { state, message, connected };
}
