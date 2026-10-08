import queue
import threading
import time

import sounddevice as sd
import speech_recognition as sr


class SoundDeviceSource(sr.AudioSource):
    """Adapt sounddevice to SpeechRecognition's phrase detector."""

    def __init__(self):
        self.SAMPLE_RATE = int(sd.query_devices(kind="input")["default_samplerate"])
        self.SAMPLE_WIDTH = 2
        self.CHUNK = 1024
        self.stream = None

    def __enter__(self):
        self._input = sd.RawInputStream(
            samplerate=self.SAMPLE_RATE, blocksize=self.CHUNK,
            channels=1, dtype="int16",
        )
        self._input.start()
        self.stream = self
        return self

    def read(self, size):
        data, _ = self._input.read(size)
        return bytes(data)

    def __exit__(self, *args):
        self._input.stop()
        self._input.close()
        self.stream = None


class ContinuousVoice:
    def __init__(self):
        self.phrases = queue.Queue(maxsize=8)
        self.lock = threading.Lock()
        self.transcription_lock = threading.Lock()
        self.thread = None
        self.last_request = 0
        self.error = None

    def _capture(self):
        detector = sr.Recognizer()
        detector.pause_threshold = 0.6
        detector.non_speaking_duration = 0.3
        try:
            with SoundDeviceSource() as source:
                # Capture continues while the HTTP thread transcribes earlier speech.
                while time.monotonic() - self.last_request < 30:
                    try:
                        audio = detector.listen(source, timeout=1, phrase_time_limit=6)
                    except sr.WaitTimeoutError:
                        continue
                    try:
                        self.phrases.put_nowait((time.monotonic(), audio))
                    except queue.Full:
                        pass
        except Exception as exc:
            self.error = str(exc)

    def transcribe(self, timeout):
        if not self.transcription_lock.acquire(blocking=False):
            return "Error: Voice is already in use by another request."
        try:
            with self.lock:
                self.last_request = time.monotonic()
                if self.thread is None or not self.thread.is_alive():
                    self.error = None
                    self.phrases = queue.Queue(maxsize=8)
                    self.thread = threading.Thread(target=self._capture, daemon=True)
                    self.thread.start()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.error:
                    raise RuntimeError(self.error)
                try:
                    recorded_at, audio = self.phrases.get(timeout=0.1)
                except queue.Empty:
                    continue
                if time.monotonic() - recorded_at > 12:
                    continue
                recognizer = sr.Recognizer()
                recognizer.operation_timeout = 8
                try:
                    return recognizer.recognize_google(audio, language="en-GB")
                except sr.UnknownValueError:
                    return "Error: Could not understand the audio."
                except (sr.RequestError, TimeoutError) as exc:
                    return f"Error: Could not request results from service; {exc}"
            return ""
        finally:
            self.transcription_lock.release()


_voice = ContinuousVoice()


def record_and_transcribe(duration=3, fs=16000):
    """Wait for a phrase; retain continuous capture between HTTP requests."""
    return _voice.transcribe(timeout=duration)


if __name__ == "__main__":
    print("Listening. Say OneTap followed by a command. Press Ctrl+C to stop.")
    while True:
        transcript = record_and_transcribe()
        if transcript:
            print(transcript)


