# Audio Spectrum Renderer

A high-performance audio spectrum visualizer and video renderer built with React, Vite, and FFmpeg. This tool allows users to create stunning audio visualizations and export them as video files with support for transparency and chroma keying.

## 🚀 Features

- **Real-time Visualization**: High-performance canvas-based audio spectrum rendering.
- **Video Export**: Render your visualizations to MP4, WebM, or GIF formats.
- **Transparency Support**: Export with transparent backgrounds or use a green screen for easy chroma keying in video editing software.
- **Highly Customizable**:
  - Adjust bar count and height multipliers.
  - Define custom frequency ranges (min/max frequency).
  - Custom background images.
- **Multilingual Support**: Integrated i18n for a global user experience.
- **Modern UI**: Sleek, responsive interface built with Tailwind CSS and Framer Motion.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Audio Processing**: Web Audio API, FFT (Fast Fourier Transform)
- **Video Rendering**: FFmpeg.wasm (`@ffmpeg/ffmpeg`)
- **Animations**: Motion (Framer Motion)
- **Icons**: Lucide React

## 📦 Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- pnpm (or npm/yarn)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/audio-spectrum-renderer.git
   cd audio-spectrum-renderer
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

## ⚙️ Customization

You can fine-tune the visualizer through the UI controls:
- **Bars**: Change the number of frequency bars to match your desired aesthetic.
- **Sensitivity**: Adjust the bar height multiplier to make the visualization more or less reactive.
- **Frequency Range**: Limit the visualization to specific frequency bands.
- **Background**: Upload your own image or toggle transparency/green screen for professional video production.

## 🎬 Exporting

The application leverages FFmpeg.wasm to process and render the visualization into a video file directly in your browser. Choose your preferred format (MP4, WebM, GIF) and export your creation.
