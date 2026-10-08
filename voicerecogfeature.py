import io
import numpy as np
import sounddevice as sd
import speech_recognition as sr
from scipy.io import wavfile


def record_and_transcribe(duration=3, fs=16000):
    """Records audio from the microphone using sounddevice

    and transcribes it via SpeechRecognition (Google API).
    """
    print(f"🎤 Recording for {duration} seconds... Speak now!")

    # 1. Record raw audio data using sounddevice
    # channels=1 ensures mono audio, which is best for speech recognition
    recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype="int16")
    sd.wait()  # Wait until the recording is finished
    print("🔄 Processing speech...")

    # 2. Convert the NumPy array into an in-memory WAV file stream
    wav_stream = io.BytesIO()
    wavfile.write(wav_stream, fs, recording)
    wav_stream.seek(0)

    # 3. Pass the in-memory stream into SpeechRecognition
    recognizer = sr.Recognizer()
    with sr.AudioFile(wav_stream) as source:
        audio_data = recognizer.record(source)

    # 4. Transcribe using Google's free API stub
    try:
        text = recognizer.recognize_google(audio_data)
        return text
    except sr.UnknownValueError:
        return "Error: Could not understand the audio."
    except sr.RequestError as e:
        return f"Error: Could not request results from service; {e}"


if __name__ == "__main__":
    # Test the pipeline
    recognized_text = record_and_transcribe(duration=5)
    print(f"\n📝 Result text: {recognized_text}")


