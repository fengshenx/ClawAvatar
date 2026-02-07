/**
 * Main App Component
 *
 * Cross-platform avatar display
 */

import { useEffect, useState } from 'react';
import { Avatar } from './components/Avatar';
import { Bubble } from './components/Bubble';
import { useOpenClaw } from './hooks/useOpenClaw';

function App() {
  const { state, message, connected } = useOpenClaw();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Set app title
    document.title = 'ClawAvatar';
  }, []);

  return (
    <div className="app">
      {/* Connection status indicator */}
      {!connected && (
        <div className="status-indicator offline">
          <span className="dot"></span>
          连接中...
        </div>
      )}

      {/* 3D Avatar */}
      <Avatar state={state} />

      {/* Speech bubble */}
      {message && <Bubble message={message} />}
    </div>
  );
}

export default App;
