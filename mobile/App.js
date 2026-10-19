import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const DEFAULT_API = 'https://ubiquitous-telegram-v6pj9pvv9v4x2xq6j-8001.app.github.dev';

export default function App() {
  const [api, setApi] = useState(DEFAULT_API);
  const [files, setFiles] = useState([]);
  const [duration, setDuration] = useState('20');
  const [count, setCount] = useState('3');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Selecciona uno o varios vídeos para comenzar.');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const pick = async () => {
    setError('');
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['video/*'], multiple: true, copyToCacheDirectory: true
      });
      if (!r.canceled && r.assets?.length) {
        setFiles(old => [...old, ...r.assets].filter((f, i, a) => a.findIndex(x => x.uri === f.uri) === i));
        setStatus(`Vídeos seleccionados: ${r.assets.length}. Pulsa “Generar clips” cuando estés listo.`);
      }
    } catch (e) {
      setError('No se pudo abrir el selector de vídeos: ' + (e?.message || String(e)));
    }
  };

  const process = async () => {
    setError('');
    setDownloadUrl('');
    if (!files.length) {
      setError('Selecciona al menos un vídeo antes de generar clips.');
      return;
    }
    const base = api.trim().replace(/\/+$/, '');
    if (!base) {
      setError('Escribe la dirección del servidor API.');
      return;
    }
    const clipDuration = Number.parseInt(duration, 10);
    const clipsCount = Number.parseInt(count, 10);
    if (!Number.isInteger(clipDuration) || clipDuration < 3 || clipDuration > 180) {
      setError('La duración debe estar entre 3 y 180 segundos.');
      return;
    }
    if (!Number.isInteger(clipsCount) || clipsCount < 1 || clipsCount > 20) {
      setError('La cantidad debe estar entre 1 y 20 clips por vídeo.');
      return;
    }

    setBusy(true);
    setStatus('Conectando con el servidor y subiendo los vídeos…');
    try {
      const form = new FormData();
      form.append('clip_duration', String(clipDuration));
      form.append('clips_per_video', String(clipsCount));
      for (const f of files) {
        if (Platform.OS === 'web' && f.file) {
          form.append('files', f.file, f.name || 'video.mp4');
        } else {
          form.append('files', {
            uri: f.uri,
            name: f.name || 'video.mp4',
            type: f.mimeType || f.type || 'video/mp4'
          });
        }
      }
      const response = await fetch(base + '/process', { method: 'POST', body: form });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { detail: raw }; }
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data);
        throw new Error(detail || 'El servidor rechazó la solicitud.');
      }
      if (!data.download_url) throw new Error('El servidor respondió, pero no envió el enlace de descarga.');
      const fullUrl = data.download_url.startsWith('http') ? data.download_url : base + data.download_url;
      setDownloadUrl(fullUrl);
      setStatus(`¡Listo! Se generaron ${data.clips_created ?? 'los'} clips. Puedes descargar el archivo ZIP.`);
    } catch (e) {
      setError('No se pudieron generar los clips. ' + (e?.message || String(e)) + ' Comprueba que el servidor esté encendido y que la dirección API sea correcta.');
      setStatus('La generación no terminó.');
    } finally {
      setBusy(false);
    }
  };

  const testServer = async () => {
    setError('');
    setStatus('Comprobando conexión con el servidor…');
    try {
      const base = api.trim().replace(/\/+$/, '');
      const response = await fetch(base + '/health');
      const data = await response.json();
      if (!response.ok) throw new Error('HTTP ' + response.status);
      setStatus('Servidor conectado. FFmpeg: ' + (data.ffmpeg ? 'disponible' : 'no detectado') + '.');
    } catch (e) {
      setError('No se pudo conectar con /health: ' + (e?.message || String(e)));
      setStatus('No se pudo comprobar el servidor.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>CLIPIA STUDIO</Text>
        <Text style={styles.title}>Tus clips, más fácil.</Text>
        <Text style={styles.subtitle}>Sube vídeos y genera clips verticales en lote.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Dirección del servidor API</Text>
          <TextInput style={styles.input} value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://tu-servidor" />
          <Pressable style={[styles.button, styles.secondary]} onPress={testServer} disabled={busy}>
            <Text style={styles.secondaryText}>Probar conexión</Text>
          </Pressable>

          <Text style={styles.label}>Vídeos</Text>
          <Pressable style={styles.button} onPress={pick} disabled={busy}>
            <Text style={styles.buttonText}>＋ Seleccionar vídeos</Text>
          </Pressable>
          {files.length > 0 && (
            <View style={styles.fileList}>
              {files.map((f, i) => <Text key={f.uri || f.name || i} style={styles.fileName}>✓ {f.name || 'Vídeo ' + (i + 1)}</Text>)}
              <Pressable onPress={() => setFiles([])}><Text style={styles.remove}>Quitar todos</Text></Pressable>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Duración (segundos)</Text>
              <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Clips por vídeo</Text>
              <TextInput style={styles.input} value={count} onChangeText={setCount} keyboardType="number-pad" />
            </View>
          </View>

          <Pressable style={[styles.button, styles.generate, busy && styles.disabled]} onPress={process} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Generar clips</Text>}
          </Pressable>

          <Text style={styles.status}>{status}</Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!downloadUrl && (
            <Pressable style={[styles.button, styles.download]} onPress={() => Linking.openURL(downloadUrl)}>
              <Text style={styles.buttonText}>Descargar clips (.zip)</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.note}>Nota: esta versión crea cortes distribuidos a lo largo del vídeo. Todavía no detecta automáticamente los mejores momentos con IA.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b1220' },
  container: { padding: 20, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#70e1c1', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginTop: 16 },
  title: { color: '#ffffff', fontSize: 30, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#b9c4d6', fontSize: 15, marginTop: 8, marginBottom: 22, lineHeight: 22 },
  card: { backgroundColor: '#151f31', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#28364c' },
  label: { color: '#e5edf8', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 7 },
  input: { color: '#ffffff', backgroundColor: '#0b1220', borderColor: '#34445d', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
  button: { backgroundColor: '#2c7cf6', borderRadius: 11, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  secondary: { backgroundColor: '#25344a' },
  secondaryText: { color: '#e5edf8', fontWeight: '700', fontSize: 14 },
  fileList: { backgroundColor: '#0b1220', borderRadius: 10, padding: 12, marginTop: 10 },
  fileName: { color: '#c7d5e8', fontSize: 13, marginVertical: 3 },
  remove: { color: '#fca5a5', fontSize: 13, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  generate: { backgroundColor: '#0d9b77', marginTop: 20, minHeight: 48 },
  disabled: { opacity: 0.65 },
  status: { color: '#a9f3dc', fontSize: 13, lineHeight: 19, marginTop: 16 },
  error: { color: '#fecaca', backgroundColor: '#481f2b', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 13, lineHeight: 19 },
  download: { backgroundColor: '#7257e8', marginTop: 14 },
  note: { color: '#8e9bb0', fontSize: 12, lineHeight: 18, marginTop: 18 }
});
