import { useState, useEffect, useRef } from 'react';
import { VisualizerSettings } from '../types';

export const useAudioPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    const node = ctx.createAnalyser();
    node.fftSize = 2048;
    setAnalyser(node);

    return () => {
      ctx.close();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const loadAudio = async (file: File) => {
    if (!audioContextRef.current) return;

    stop();

    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    setAudioBuffer(decodedBuffer);
    setDuration(decodedBuffer.duration);
    setCurrentTime(0);
    pausedTimeRef.current = 0;
  };

  const play = () => {
    if (!audioContextRef.current || !audioBuffer || !analyser) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContextRef.current.destination);

    const offset = pausedTimeRef.current % audioBuffer.duration;
    source.start(0, offset);

    startTimeRef.current = audioContextRef.current.currentTime - offset;
    sourceRef.current = source;
    setIsPlaying(true);

    const updateProgress = () => {
      if (!audioContextRef.current) return;
      const now = audioContextRef.current.currentTime;
      const current = now - startTimeRef.current;

      if (current >= duration) {
        stop();
        setCurrentTime(0);
        pausedTimeRef.current = 0;
      } else {
        setCurrentTime(current);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };
    updateProgress();
  };

  const pause = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      pausedTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
    }
    setIsPlaying(false);
    cancelAnimationFrame(animationFrameRef.current);
  };

  const stop = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsPlaying(false);
    cancelAnimationFrame(animationFrameRef.current);
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const getFrequencyData = (dataArray: Uint8Array) => {
    if (analyser) {
      analyser.getByteFrequencyData(dataArray as any);
    }
  };

  const seek = (time: number) => {
    if (!audioContextRef.current || !audioBuffer) return;

    const wasPlaying = isPlaying;
    if (isPlaying) {
      stop();
    }

    pausedTimeRef.current = time;
    setCurrentTime(time);

    if (wasPlaying) {
      play();
    }
  };

  return {
    isPlaying,
    currentTime,
    duration,
    loadAudio,
    togglePlay,
    seek,
    getFrequencyData,
    analyser,
    audioBuffer,
    audioContext: audioContextRef.current
  };
};
