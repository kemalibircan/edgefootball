import React from 'react';
import {FlatList, Modal, Pressable, Text, View} from 'react-native';
import type {ModelItem} from '../../types/api';
import {colors} from '../../theme/colors';

type Props = {
  visible: boolean;
  models: ModelItem[];
  selectedModelId: string;
  onClose: () => void;
  onSelect: (modelId: string) => void;
};

export function ModelPickerSheet({visible, models, selectedModelId, onClose, onSelect}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: 'flex-end'}}>
        <View
          style={{
            backgroundColor: colors.backgroundElevated,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: '72%',
            padding: 14,
            gap: 10,
            borderTopWidth: 1,
            borderColor: colors.line,
          }}>
          <Text style={{fontSize: 17, fontWeight: '700', color: colors.text}}>Model Secimi</Text>
          <Pressable onPress={onClose}>
            <Text style={{color: colors.accent, fontWeight: '600'}}>Kapat</Text>
          </Pressable>
          <FlatList
            data={models}
            keyExtractor={item => item.model_id}
            renderItem={({item}) => {
              const active = item.model_id === selectedModelId;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.model_id);
                    onClose();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.line,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    backgroundColor: active ? colors.accentSoft : colors.card,
                  }}>
                  <Text style={{fontWeight: '700', color: colors.text}}>{item.model_name || item.model_id}</Text>
                  <Text style={{fontSize: 12, color: colors.textMuted}}>{item.model_id}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
