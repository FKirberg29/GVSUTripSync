/**
 * SettingsScreen Component
 * 
 * Displays app settings that users can configure:
 * - Temperature unit preference (Celsius/Fahrenheit)
 * - Notification preferences for different types of events
 * 
 * Settings are persisted through the SettingsContext and synced across devices.
 */

import React, { useContext } from 'react';
import { View, Text, Button, Switch, ScrollView } from 'react-native';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { theme } from '../theme';
import { styles } from '../styles/SettingsScreen.styles';

export default function SettingsScreen() {
  const { temperatureUnit, setTemperatureUnit, notificationPrefs, updateNotificationPrefs } = useContext(SettingsContext);

  const handleNotificationToggle = (key) => {
    updateNotificationPrefs({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Preferred Temperature Unit:</Text>
      <View style={styles.buttonRow}>
        <Button
          title="°C"
          color={temperatureUnit === 'celsius' ? theme.accent : '#aaa'}
          onPress={() => setTemperatureUnit('celsius')}
        />
        <Button
          title="°F"
          color={temperatureUnit === 'fahrenheit' ? theme.accent : '#aaa'}
          onPress={() => setTemperatureUnit('fahrenheit')}
        />
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={styles.label}>Notifications</Text>
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text>Chat messages</Text>
            <Switch
              value={notificationPrefs.chatMessages}
              onValueChange={() => handleNotificationToggle('chatMessages')}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text>Mentions (@username)</Text>
            <Switch
              value={notificationPrefs.mentions}
              onValueChange={() => handleNotificationToggle('mentions')}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text>Friend requests</Text>
            <Switch
              value={notificationPrefs.friendRequests}
              onValueChange={() => handleNotificationToggle('friendRequests')}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text>Trip invites</Text>
            <Switch
              value={notificationPrefs.tripInvites}
              onValueChange={() => handleNotificationToggle('tripInvites')}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text>Comments on itinerary items</Text>
            <Switch
              value={notificationPrefs.comments}
              onValueChange={() => handleNotificationToggle('comments')}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
