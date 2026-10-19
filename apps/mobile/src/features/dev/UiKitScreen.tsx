import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { THEME_PREFERENCES, useTheme, useThemeSetting } from '@/theme/theme';
import type { TypeVariant } from '@/theme/tokens';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ChoiceField } from '@/ui/ChoiceField';
import { Divider } from '@/ui/Divider';
import { FareStepper } from '@/ui/FareStepper';
import { Num } from '@/ui/Num';
import { Pill } from '@/ui/Pill';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { StageBar } from '@/ui/StageBar';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

const TYPE_SAMPLES: TypeVariant[] = [
  'title',
  'heading',
  'body',
  'bodyStrong',
  'label',
  'caption',
  'micro',
];
const COLOR_SWATCHES = [
  'background',
  'surface',
  'surface2',
  'line',
  'track',
  'brand',
  'brandTint',
  'success',
  'warning',
  'danger',
] as const;

/** Every primitive in the current theme. Dev builds only (`/dev/ui`). */
export function UiKitScreen() {
  const t = useTheme();
  const setting = useThemeSetting();
  const [fare, setFare] = useState(85);
  const [chip, setChip] = useState<string>('Breakdown');
  const [vehicle, setVehicle] = useState<'car' | 'van' | 'suv'>('car');

  return (
    <ScrollView
      style={{ backgroundColor: t.color.background }}
      contentContainerStyle={styles.content}
    >
      <Section title={`Theme: ${t.scheme} / ${t.variant}`}>
        <ChoiceField
          label="Appearance"
          options={THEME_PREFERENCES.map((value) => ({ value, label: value }))}
          value={setting.preference}
          onChange={setting.setPreference}
        />
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map((name) => (
            <View key={name} style={styles.swatch}>
              <View
                style={[
                  styles.chipColor,
                  { backgroundColor: t.color[name], borderColor: t.color.line },
                ]}
              />
              <Text variant="micro" tone="muted">
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        {TYPE_SAMPLES.map((variant) => (
          <Text key={variant} variant={variant}>
            {variant} · Avenue Habib Bourguiba
          </Text>
        ))}
        <Num value="85" unit="TND" size="display" />
        <Num value="18.4" unit="km" size="figure" />
        <Num value="1 234" unit="TND" size="small" />
      </Section>

      <Section title="Buttons">
        <Button title="Primary" onPress={noop} />
        <Button title="Secondary" kind="secondary" onPress={noop} />
        <Button title="Danger" kind="danger" onPress={noop} />
        <Button title="Ghost" kind="ghost" onPress={noop} />
        <Button title="Link" kind="link" onPress={noop} />
        <Button title="Small" size="sm" onPress={noop} />
        <Button title="Loading" loading onPress={noop} />
        <Button title="Disabled" disabled onPress={noop} />
        <Button title="Accept and go (big)" size="big" onPress={noop} />
      </Section>

      <Section title="Fields">
        <TextField label="Full name" placeholder="Sami Ben Ali" />
        <TextField label="Phone" defaultValue="123" error="Enter a valid phone number" />
        <ChoiceField
          label="Vehicle"
          options={[
            { value: 'car', label: 'Car' },
            { value: 'van', label: 'Van' },
            { value: 'suv', label: 'SUV' },
          ]}
          value={vehicle}
          onChange={setVehicle}
        />
        <FareStepper fare={fare} min={20} max={300} onChange={setFare} />
      </Section>

      <Section title="Chips, pills, avatars">
        <View style={styles.row}>
          {['Breakdown', 'Accident', 'Flat tyre'].map((label) => (
            <Chip
              key={label}
              label={label}
              selected={chip === label}
              onPress={() => setChip(label)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <Pill label="Live · 14:12 left" dot />
          <Pill label="Your fare" tone="success" />
          <Pill label="New" tone="warning" />
          <Pill label="Offer" tone="brand" />
          <Pill label="Failed" tone="danger" />
        </View>
        <View style={styles.row}>
          <Avatar name="Sami Ben Ali" />
          <Avatar name="Nizar H." size={40} />
          <Avatar name="Ayoub K." size={56} />
          <RoundButton accessibilityLabel="Locate me" onPress={noop}>
            <Text variant="heading">◎</Text>
          </RoundButton>
          <RoundButton accessibilityLabel="Call" tone="field" onPress={noop}>
            <Text variant="heading">✆</Text>
          </RoundButton>
          <RoundButton accessibilityLabel="Go" tone="brand" onPress={noop}>
            <Text variant="heading" tone="onBrand">
              →
            </Text>
          </RoundButton>
        </View>
      </Section>

      <Section title="Stage bar and divider">
        <StageBar stages={['Heading', 'Arrived', 'Loaded', 'Done']} current={1} progress={0.55} />
        <Divider />
        <Text variant="caption" tone="muted">
          Fare · cash to driver
        </Text>
      </Section>

      <Sheet>
        <Text variant="title">Sheet</Text>
        <Text tone="muted">A static card; the map shell adds dragging.</Text>
        <View style={styles.sheetAction}>
          <Button title="Next" size="big" onPress={noop} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function noop() {}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 0 },
  section: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { alignItems: 'center', gap: 4, width: 64 },
  chipColor: { width: 48, height: 32, borderRadius: 8, borderWidth: 1 },
  sheetAction: { marginTop: 16 },
});
