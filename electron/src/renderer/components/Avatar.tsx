/**
 * Avatar Component
 *
 * 3D VRM avatar display
 * MVP: Simple colored box
 * TODO: Replace with React Three Fiber + VRM
 */

import { useMemo } from 'react';

interface AvatarProps {
  state: 'idle' | 'working' | 'thinking' | 'happy' | 'sleeping';
}

export function Avatar({ state }: AvatarProps) {
  const color = useMemo(() => {
    switch (state) {
      case 'idle':
        return '#10b981'; // green
      case 'working':
        return '#3b82f6'; // blue
      case 'thinking':
        return '#f59e0b'; // orange
      case 'happy':
        return '#ec4899'; // pink
      case 'sleeping':
        return '#8b5cf6'; // purple
      default:
        return '#6b7280'; // gray
    }
  }, [state]);

  return (
    <div className="avatar-container">
      {/* MVP: Simple colored box */}
      <div
        style={{
          width: '200px',
          height: '200px',
          margin: '50px auto',
          backgroundColor: color,
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          transition: 'background-color 0.3s ease'
        }}
      >
        {state}
      </div>

      {/* TODO: Replace with React Three Fiber + VRM */}
      {/* <Canvas> */}
      {/*   <VRM url="/models/catbot.vrm" /> */}
      {/* </Canvas> */}
    </div>
  );
}
