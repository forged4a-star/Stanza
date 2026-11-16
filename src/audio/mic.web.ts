/** Live microphone frames in the browser (getUserMedia + Web Audio). */
export type FrameHandler = (samples: Float32Array, sampleRate: number) => void;

export async function startMic(onFrame: FrameHandler): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally available and needs no worklet file
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  proc.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
  src.connect(proc);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  proc.connect(sink);
  sink.connect(ctx.destination);
  return () => {
    proc.disconnect();
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}
