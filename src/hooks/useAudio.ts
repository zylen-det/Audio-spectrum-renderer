import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioFile } from '../types';
import { getCavaFftSize } from '../utils/audioMath';

export const useAudioPlayer = (
  files: AudioFile[] = [],
  currentFileIndex: number = -1
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [volume, setVolumeState] = useState(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const currentFileIndexRef = useRef(currentFileIndex);

  useEffect(() => {
    currentFileIndexRef.current = currentFileIndex;
  }, [currentFileIndex]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;

    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = Math.min(32768, getCavaFftSize(ctx.sampleRate) * 2);
    setAnalyser(analyserNode);

    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    analyserNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNodeRef.current = gainNode;

    return () => {
      ctx.close();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsPlaying(false);
    cancelAnimationFrame(animationFrameRef.current);
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

  const play = useCallback(() => {
    if (!audioContextRef.current || !audioBuffer || !analyser) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

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
  }, [audioBuffer, analyser, duration, stop]);

  const pause = useCallback(() => {
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
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const getFrequencyData = (dataArray: Uint8Array) => {
    if (analyser) {
      analyser.getByteFrequencyData(dataArray as any);
    }
  };

  const seek = useCallback((time: number) => {
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
  }, [audioBuffer, isPlaying, stop, play]);

  const setVolume = useCallback((val: number) => {
    setVolumeState(val);
  }, []);

  const nextTrack = useCallback(() => {
    if (files.length === 0) return;
    const nextIdx = (currentFileIndexRef.current + 1) % files.length;
    return nextIdx;
  }, [files.length]);

  const prevTrack = useCallback(() => {
    if (files.length === 0) return;
    const prevIdx = (currentFileIndexRef.current - 1 + files.length) % files.length;
    return prevIdx;
  }, [files.length]);

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
    audioContext: audioContextRef.current,
    volume,
    setVolume,
    nextTrack,
    prevTrack,
  };
};
