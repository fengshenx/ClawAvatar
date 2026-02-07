# ClawAvatar

CatBot Avatar Desktop Application for OpenClaw

## 🎯 Overview

ClawAvatar is a desktop application that displays a 3D avatar in the bottom-right corner of your screen. It connects to OpenClaw Gateway and shows the agent's status in real-time.

## 🏗️ Architecture

```
ClawAvatar/
├── electron/           # Electron main process
│   ├── src/
│   │   ├── main/       # Main process (window management)
│   │   ├── preload/    # Preload scripts (IPC bridge)
│   │   └── renderer/  # React UI
│   └── platforms/     # Platform-specific code
│       ├── mac/       # macOS-specific
│       └── win/       # Windows-specific
├── shared/            # Shared code (types, utilities)
└── public/           # Static assets (VRM models)
```

## 🚀 Development

### Prerequisites

- Node.js 22+
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Build for macOS
npm run build:mac

# Build for Windows
npm run build:win
```

## 📦 Current Status

### MVP (Minimum Viable Product)
- ✅ Project structure
- ✅ Electron window (transparent, always-on-top)
- ✅ React + TypeScript setup
- ✅ Basic UI components
- ✅ Simulated OpenClaw connection

### TODO
- [ ] React Three Fiber + VRM integration
- [ ] Real OpenClaw WebSocket connection
- [ ] Avatar animations and expressions
- [ ] macOS-specific optimizations
- [ ] Windows support (future)

## 🎨 Features

### Planned
- 3D VRM avatar (VRoid models)
- Real-time status updates from OpenClaw
- Speech bubbles
- Multiple expressions (idle, working, thinking, happy, sleeping)
- Cross-platform support (macOS, Windows, Linux)

## 🛠️ Tech Stack

- **Desktop**: Electron
- **UI**: React + TypeScript
- **3D Rendering**: React Three Fiber
- **VRM**: @pixiv/three-vrm
- **Build**: Vite + Electron Builder
- **Communication**: WebSocket (OpenClaw Gateway)

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
