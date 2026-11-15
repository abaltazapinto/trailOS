import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { formatDistance, formatDuration, sportLabels } from '../../ui/format';
import { deleteApiKey, loadApiKey, saveApiKey } from './apiKeyStore';
import { importFitFile, syncGarminActivities, type GarminImportResult } from './importer';
import { GarminApiError, GarminPersonalApi, PERSONAL_API_KEY_URL } from './personalApi';

type Connection = 'checking' | 'disconnected' | 'connected';
type Task = 'connecting' | 'syncing' | 'importing';

function summarize(results: GarminImportResult[]): string {
  const count = (status: GarminImportResult['status']) =>
    results.filter((result) => result.status === status).length;
  if (results.length === 0) return 'No activities found.';
  return `${count('imported')} imported · ${count('skipped')} already in trailOS · ${count('failed')} failed`;
}

function ResultRow({ result }: { result: GarminImportResult }) {
  if (result.status === 'skipped') return null;
  if (result.status === 'failed') {
    return (
      <View style={styles.result}>
        <Text style={styles.resultTitle}>{result.label}</Text>
        <Text style={styles.error}>{result.message}</Text>
      </View>
    );
  }
  const { activity } = result;
  const details = [
    formatDistance(activity.distance),
    formatDuration(activity.duration),
    activity.elevationGain !== undefined ? `↑ ${Math.round(activity.elevationGain)} m` : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.result}>
      <Text style={styles.resultTitle}>{result.label}</Text>
      <Text style={styles.resultDetails}>
        {sportLabels[activity.sport]} · {activity.startTime.toLocaleString()}
      </Text>
      <Text style={styles.resultDetails}>{details}</Text>
      <Text style={styles.hint}>
        {activity.trackPoints.length} GPS points · Garmin sport: {result.garminSport}
      </Text>
    </View>
  );
}

function Action({ label, onPress, disabled, primary = false }: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.primaryAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.primaryActionText]}>{label}</Text>
    </Pressable>
  );
}

/** Garmin integration: sync from Garmin Connect, with manual .fit import as the fallback. */
export default function GarminCard({ disabled }: { disabled: boolean }) {
  const [connection, setConnection] = useState<Connection>('checking');
  const [keyInput, setKeyInput] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const taskRef = useRef<Task | null>(null);
  // Reused across syncs so the 24-hour access token is not requested every time.
  const api = useRef<GarminPersonalApi | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GarminImportResult[]>([]);
  const busy = disabled || task !== null;

  useEffect(() => {
    let active = true;
    loadApiKey()
      .then((key) => {
        if (!active) return;
        if (key) api.current = new GarminPersonalApi(key);
        setConnection(key ? 'connected' : 'disconnected');
      })
      .catch(() => active && setConnection('disconnected'));
    return () => {
      active = false;
    };
  }, []);

  const run = async (next: Task, work: () => Promise<void>) => {
    if (taskRef.current) return;
    taskRef.current = next;
    setTask(next);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof GarminApiError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      taskRef.current = null;
      setTask(null);
    }
  };

  const connect = () => run('connecting', async () => {
    const key = keyInput.trim();
    const candidate = new GarminPersonalApi(key);
    await candidate.verify();
    await saveApiKey(key);
    api.current = candidate;
    setKeyInput('');
    setConnection('connected');
    setStatus('Connected to Garmin Connect.');
  });

  const disconnect = () => run('connecting', async () => {
    await deleteApiKey();
    api.current = null;
    setConnection('disconnected');
    setResults([]);
    setStatus('Disconnected. The API key was removed from this phone.');
  });

  const sync = () => run('syncing', async () => {
    if (!api.current) return;
    setStatus('Syncing with Garmin Connect…');
    const report = await syncGarminActivities(api.current);
    setResults(report.results);
    setStatus(`Checked activities since ${report.since}: ${summarize(report.results)}`);
    if (report.error) setError(report.error);
  });

  const importFile = () => run('importing', async () => {
    // FIT has no MIME type that Android file providers agree on, so accept any file and check its contents.
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (picked.canceled) return;
    const imported: GarminImportResult[] = [];
    for (const asset of picked.assets) imported.push(...await importFitFile(asset.uri, asset.name));
    setResults(imported);
    setStatus(`File import: ${summarize(imported)}`);
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Garmin</Text>

      {connection === 'checking' && <Text style={styles.hint}>Checking Garmin connection…</Text>}

      {connection === 'disconnected' && (
        <>
          <Text style={styles.hint}>
            Create a Personal API key on Garmin Connect, copy it, and paste it here. The key is
            stored encrypted on this phone only.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PERSONAL_API_KEY_URL)}>
            <Text style={styles.link}>Create a key on Garmin Connect</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Garmin Personal API key"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setKeyInput}
            placeholder="Personal API key"
            placeholderTextColor="#7b8a7f"
            secureTextEntry
            style={styles.input}
            value={keyInput}
          />
          <Action
            label={task === 'connecting' ? 'Connecting…' : 'Connect Garmin account'}
            onPress={() => void connect()}
            disabled={busy || keyInput.trim() === ''}
            primary
          />
        </>
      )}

      {connection === 'connected' && (
        <>
          <Text style={styles.hint}>Connected to Garmin Connect.</Text>
          <Action
            label={task === 'syncing' ? 'Syncing…' : 'Sync Garmin activities'}
            onPress={() => void sync()}
            disabled={busy}
            primary
          />
          <Action label="Disconnect" onPress={() => void disconnect()} disabled={busy} />
        </>
      )}

      <Text style={[styles.hint, styles.fallback]}>
        No connection? Import a .fit file copied from the watch, or a Garmin Connect export.
      </Text>
      <Action
        label={task === 'importing' ? 'Importing…' : 'Import .fit file'}
        onPress={() => void importFile()}
        disabled={busy}
      />

      <View accessibilityLiveRegion="polite" style={styles.feedback}>
        {status && <Text style={styles.resultDetails}>{status}</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {results.map((result, index) => <ResultRow key={`${result.label}-${index}`} result={result} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 32, backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { color: '#18271e', fontSize: 22, fontWeight: '700' },
  hint: { color: '#46574b', fontSize: 14 },
  fallback: { marginTop: 12 },
  link: { color: '#28563a', fontSize: 16, fontWeight: '600', textDecorationLine: 'underline', paddingVertical: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#63786a',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#18271e',
    fontSize: 16,
  },
  action: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#28563a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: { backgroundColor: '#28563a' },
  actionText: { color: '#28563a', fontSize: 16, fontWeight: '600' },
  primaryActionText: { color: '#fff' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  feedback: { gap: 12 },
  result: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c9d3cb', paddingTop: 12, gap: 4 },
  resultTitle: { color: '#18271e', fontSize: 16, fontWeight: '600' },
  resultDetails: { color: '#18271e', fontSize: 15 },
  error: { color: '#a13232', fontSize: 14 },
});
