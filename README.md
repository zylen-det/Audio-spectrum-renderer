# Audio Spectrum Renderer

A high-performance audio spectrum visualizer and video renderer built with React, Vite, WebCodecs (mediabunny) and FFmpeg.wasm. This tool allows users to create stunning audio visualizations and export them as video files with support for transparency and chroma keying.

## Features

- **Real-time Visualization**: High-performance canvas-based [cava](https://github.com/karlstav/cava)-style audio spectrum rendering.
- **Video Export**: Render your visualizations to MP4 (H.264), WebM (VP9) or GIF formats.
- **Transparency Support**: Export WebM with transparent background (VP9 + alpha) or use a green screen (`#00FF00`) for easy chroma keying in video editing software.
- **Custom Background**: Upload your own image (cropped to 16:9, 1280x720) with adjustable brightness dimming. Disabled while green screen / transparent mode is on.
- **Encoder Choice**: WebCodec Hardware / Software with automatic capability probing (VP9-alpha probe, 1-frame H.264 HW trial); transparent mode falls back to H.264/MP4 when VP9+alpha is unavailable.
- **Highly Customizable**:
  - Layout: bar count, bar width, spacing, total width, Y offset, corner radius.
  - Positive / negative wave: independent height scales and colors.
  - Global cava dynamics: manual sensitivity, automatic sensitivity (autosens), noise reduction (integral + gravity smoothing).
  - Frequency range (min/max frequency).
- **Multilingual Support**: Integrated i18n (English / 中文).
- **Modern UI**: Sleek, responsive interface built with Tailwind CSS and Motion.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, React Router
- **Styling**: Tailwind CSS
- **Audio Processing**: Web Audio API + [cava](https://github.com/karlstav/cava)-style analysis (`src/utils/audioMath.ts`: plan/state, time-domain frames, sensitivity/autosens/noise reduction)
- **Video Rendering**: mediabunny via WebCodecs (`src/workers/videoWorker.ts`) + FFmpeg.wasm (`@ffmpeg/ffmpeg`) for mixing
- **Background Upload**: `react-easy-crop` (16:9 crop to 1280x720 data URL, passed to preview `Visualizer` and workers as `ImageBitmap`)
- **Controls**: `react-range` (frequency range slider)
- **Animations**: Motion
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- pnpm (or npm/yarn)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/zylen-det/Audio-spectrum-renderer.git
   cd Audio-spectrum-renderer
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

4. Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5173`).

## Customization

You can fine-tune the visualizer through the UI controls (`FloatingControls`, `VisualizerSettings` in `src/types.ts`):
- **Layout**: bar count, bar width, spacing, total width, Y offset, corner radius.
- **Positive / Negative wave**: height scale + color for each side.
- **Global (cava)**: sensitivity (manual, ignored while autosens is on), automatic sensitivity, noise reduction (0 = fast/noisy, 100 = slow/smooth).
- **Frequency Range**: min/max frequency band (Hz) for the analysis.
- **Render**: render FPS, encoder (hardware/software), export format.
- **Background**: upload image + brightness, or green screen / transparent background (mutually exclusive with uploaded image; transparent forces non-MP4 export).

## Exporting

The app renders frames in a worker (`src/workers/videoWorker.ts`) via mediabunny/WebCodecs directly in the browser, then mixes audio with FFmpeg.wasm. Choose MP4 (H.264), WebM (VP9, keeps alpha for transparency) or GIF and export your creation. If transparent WebM is not supported (VP9+alpha probe fails), it falls back to H.264/MP4 without alpha.
