import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export default function App() {
  const [api, setApi] = useState('http://192.168.1.10:8000');
  const [files, setFiles] = useState([]);
  const [duration, setDuration] = useState('20');
  const [count, setCount] = useState('3');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['video/*'], multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) setFiles(old => [...old, ...r.assets].filter((f, i, a) => a.findIndex(x => x.uri === f.uri) === i));
  };
  const process = async () => {
    if (!files.length) return Alert.alert('Faltan vídeos', 'Selecciona al menos un vídeo.');
    if (!api.trim()) return Alert.alert('Falta servidor', 'Escribe la URL de tu servidor API.');
    const d = Number(duration), n = Number(count);
    if (!Number.isFinite(d) || d < 3 || d > 180 || !Number.isInteger(n) || n < 1 || n > 20) return Alert.alert('Revisa la configuración', 'Duración: 3–180 segundos; cantidad: 1–20 clips por vídeo.');
    setBusy(true); setResult('');
    try {
      const form = new FormData();
      form.append('clip_duration', String(d)); form.append('clips_per_video', String(n));
      files.forEach((f, i) => form.append('files', { uri: f.uri, name: f.name || `video-${i}.mp4`, type: f.mimeType || 'video/mp4' }));
      const response = await fetch(`${api.replace(/\/$/, '')}/process`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'El servidor no pudo procesar los vídeos.');
      setResult(JSON.stringify(data, null, 2));
      Alert.alert('Proceso terminado', 'El servidor respondió. Revisa los enlaces devueltos abajo.');
    } catch (e) {const mensaje = e?.message || String(e);setResult('ERROR AL PROCESAR: ' + mensaje);Alert.alert('No se pudo procesar', mensaje);}
    finally { setBusy(false); }
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.kicker}>CREATOR TOOLKIT · MVP 0.1</Text><Text style={s.title}>ClipIA Studio</Text>
    <Text style={s.sub}>Convierte vídeos largos en clips verticales listos para revisar.</Text>
    <View style={s.card}><Text style={s.heading}>1. Selecciona tus vídeos</Text><Pressable style={s.button} onPress={pick}><Text style={s.buttonText}>＋ Añadir vídeos</Text></Pressable><Text style={s.muted}>{files.length ? `${files.length} vídeo(s) seleccionado(s)` : 'Aún no has seleccionado vídeos'}</Text>{files.map((f,i)=><Text key={f.uri} style={s.file}>• {f.name || `Vídeo ${i+1}`}</Text>)}{files.length>0&&<Pressable onPress={()=>setFiles([])}><Text style={s.remove}>Quitar todos</Text></Pressable>}</View>
    <View style={s.card}><Text style={s.heading}>2. Configura los clips</Text><Text style={s.label}>Duración por clip (segundos)</Text><TextInput style={s.input} keyboardType="number-pad" value={duration} onChangeText={setDuration}/><Text style={s.label}>Cantidad de clips por vídeo</Text><TextInput style={s.input} keyboardType="number-pad" value={count} onChangeText={setCount}/><Text style={s.muted}>Formato de salida: vertical 9:16 · MP4</Text></View>
    <View style={s.card}><Text style={s.heading}>3. Conecta el servidor</Text><Text style={s.label}>URL de la API</Text><TextInput style={s.input} autoCapitalize="none" autoCorrect={false} value={api} onChangeText={setApi} placeholder="https://tu-servidor.example.com"/><Text style={s.muted}>La dirección de ejemplo debe reemplazarse por la URL real del backend.</Text></View>
    <Pressable disabled={busy} style={[s.button,s.primary,busy&&s.disabled]} onPress={process}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Generar clips</Text>}</Pressable>
    {busy&&<Text style={s.muted}>Subiendo y procesando… No cierres la app.</Text>}
    {!!result&&<View style={s.card}><Text style={s.heading}>Respuesta del servidor</Text><Text selectable style={s.result}>{result}</Text></View>}
    <Text style={s.footer}>Prototipo inicial. La selección de mejores momentos con IA y la descarga directa dentro de la app se incorporarán después de validar el procesamiento básico.</Text>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#0b1020'},page:{padding:20,paddingBottom:40,gap:14},kicker:{color:'#8ea4ff',fontSize:11,fontWeight:'800',letterSpacing:2,marginTop:10},title:{color:'#fff',fontSize:34,fontWeight:'900'},sub:{color:'#b8c1d9',fontSize:15,lineHeight:22,marginBottom:4},card:{backgroundColor:'#151d32',borderColor:'#273451',borderWidth:1,borderRadius:18,padding:16,gap:10},heading:{color:'#fff',fontSize:17,fontWeight:'800',marginBottom:3},button:{backgroundColor:'#354b84',padding:14,borderRadius:12,alignItems:'center',justifyContent:'center',minHeight:48},primary:{backgroundColor:'#526fff',marginTop:2},disabled:{opacity:0.6},buttonText:{color:'#fff',fontWeight:'800',fontSize:15},muted:{color:'#9eabc8',fontSize:12,lineHeight:18},file:{color:'#e7ecff',fontSize:13},remove:{color:'#ff9f9f',fontWeight:'700',paddingTop:4},label:{color:'#d6def4',fontSize:13,fontWeight:'600'},input:{backgroundColor:'#0d1426',borderColor:'#35415f',borderWidth:1,borderRadius:10,color:'#fff',paddingHorizontal:12,paddingVertical:11,fontSize:15},result:{color:'#c9d6ff',fontSize:12,lineHeight:18},footer:{color:'#7f8ba8',fontSize:11,lineHeight:17,textAlign:'center',marginTop:8}});
