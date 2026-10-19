import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { fetchSchoolConfig, normalizeCode, saveSchool } from '../lib/school';
import { useSchool } from '../lib/school-context';
import { useTheme } from '../lib/theme';

export default function SchoolCodeScreen() {
  const { colors, radius } = useTheme();
  const { setSchool } = useSchool();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const c = normalizeCode(code);
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const config = await fetchSchoolConfig(c);
      if (!config) {
        setError('School code not found. Check it with your school office.');
        return;
      }
      await saveSchool(c, config);
      setSchool(config);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        padding: 24,
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}
      >
        Enter your school code
      </Text>
      <Text style={{ color: colors.textMuted }}>Your school office gives you this code.</Text>
      <TextInput
        accessibilityLabel="School code"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
        placeholder="e.g. sample-high"
        placeholderTextColor={colors.textMuted}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: radius,
          paddingHorizontal: 12,
          color: colors.text,
          backgroundColor: colors.surface,
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={submit}
        style={{
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: radius,
          backgroundColor: colors.primary,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>
          {busy ? 'Checking...' : 'Continue'}
        </Text>
      </Pressable>
    </View>
  );
}
