import { Text, View } from 'react-native';
import { APP_NAME } from '@bonamind/core';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' }}>
      <Text style={{ color: '#F0EFFE', fontSize: 32 }}>{APP_NAME}</Text>
    </View>
  );
}
