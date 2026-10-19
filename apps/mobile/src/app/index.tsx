import { Pressable, Text, View } from 'react-native';
import { forgetSchool } from '../lib/school';
import { useSchool } from '../lib/school-context';
import { useTheme } from '../lib/theme';

export default function Home() {
  const { colors, radius } = useTheme();
  const { school, setSchool } = useSchool();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.primary, padding: 24, paddingTop: 56 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.onPrimary, fontSize: 20, fontWeight: '700' }}
        >
          {school?.school.name}
        </Text>
        <Text style={{ color: colors.onPrimary }}>{school?.school.motto}</Text>
      </View>
      <View style={{ padding: 24, gap: 12 }}>
        <Text style={{ color: colors.textMuted }}>Sign-in arrives in Phase 1.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await forgetSchool();
            setSchool(null);
          }}
          style={{
            minHeight: 48,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: radius,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={{ color: colors.onAccent, fontWeight: '600' }}>Change school</Text>
        </Pressable>
      </View>
    </View>
  );
}
