import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { PublicTenantConfig } from '@digischools/config-schema';
import { getSavedSchoolCode, loadSchool } from '../lib/school';
import { ThemeProvider } from '../lib/theme';
import { SchoolContext } from '../lib/school-context';

export default function RootLayout() {
  const [school, setSchool] = useState<PublicTenantConfig | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const code = await getSavedSchoolCode();
      setSchool(code ? await loadSchool(code) : null);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onEntry = segments[0] === 'school-code';
    if (!school && !onEntry) router.replace('/school-code');
    if (school && onEntry) router.replace('/');
  }, [ready, school, segments, router]);

  const ctx = useMemo(() => ({ school, setSchool }), [school]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  return (
    <SchoolContext.Provider value={ctx}>
      <ThemeProvider school={school}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SchoolContext.Provider>
  );
}
