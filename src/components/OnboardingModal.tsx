import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from '../hooks/use-color-scheme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { uploadFile } from '../lib/storage';
import { getAssetExtension } from '../lib/media';
import { ActionModal } from '@/components/ActionModal';
import { AppIcons } from '../constants/icons';
import { Colors, Spacing, Fonts } from '../constants/theme';

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ visible, onClose }: OnboardingModalProps) {
  const { profile, updateProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarExt, setAvatarExt] = useState<string>('jpg');
  const [gender, setGender] = useState<'male' | 'female' | null>(profile?.gender ?? null);
  const [loading, setLoading] = useState(false);
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const pickAvatarMedia = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        ActionModal.show({ title: 'İzin Gerekli', message: 'Galeriye erişmek için izin vermelisiniz.', type: 'warning' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const ext = getAssetExtension(asset);
        if (ext === 'gif') {
          ActionModal.show({
            title: 'Hata',
            message: 'Profil fotoğrafı olarak GIF seçemezsiniz.',
            type: 'error',
          });
          return;
        }
        setAvatarUri(asset.uri);
        setAvatarExt(ext);
      }
    } catch (err) {
      console.error('Image picking error:', err);
    }
  };

  const handlePickImage = () => {
    pickAvatarMedia();
  };

  const handleSave = async () => {
    if (!username.trim()) {
      ActionModal.show({ title: 'Hata', message: 'Lütfen geçerli bir kullanıcı adı girin.', type: 'error' });
      return;
    }

    if (username.length < 3) {
      ActionModal.show({ title: 'Hata', message: 'Kullanıcı adı en az 3 karakter olmalıdır.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      let avatarUrl = profile?.avatar_url || null;

      if (avatarUri) {
        const fileName = `avatar_${profile?.id}_${Date.now()}.${avatarExt}`;
        avatarUrl = await uploadFile('avatars', fileName, avatarUri);
      }

      const { error } = await updateProfile({
        username: username.trim(),
        avatar_url: avatarUrl,
        gender,
      });

      if (error) {
        if (error.code === '23505') {
          ActionModal.show({ title: 'Hata', message: 'Bu kullanıcı adı zaten alınmış. Lütfen başka bir ad deneyin.', type: 'error' });
        } else {
          ActionModal.show({ title: 'Hata', message: 'Profil güncellenirken bir sorun oluştu.', type: 'error' });
        }
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error('Save profile error:', err);
      ActionModal.show({ title: 'Hata', message: err.message || 'Bir hata oluştu.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.container, { backgroundColor: 'rgba(10, 14, 26, 0.85)' }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            Hoş Geldiniz <Ionicons name="planet-outline" size={20} color={colors.primary} />
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Anonim sohbete başlamadan önce profilini özelleştir.
          </Text>

          {/* Avatar Picker */}
          <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            ) : profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.backgroundSelected }]}>
                <Ionicons name="camera-outline" size={32} color={colors.primary} />
              </View>
            )}
            <Text style={[styles.avatarHelpText, { color: colors.primary }]}>Fotoğraf Seç</Text>
          </TouchableOpacity>

          {/* Username Input */}
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Kullanıcı Adı</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="takma_adınız"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>

          {/* Gender Selector */}
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Cinsiyet (İsteğe Bağlı)</Text>
            <View style={styles.genderRow}>
              {([
                { value: 'female', label: 'Kadın', icon: AppIcons.female },
                { value: 'male', label: 'Erkek', icon: AppIcons.male },
              ] as const).map((opt) => {
                const selected = gender === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.genderPill,
                      {
                        backgroundColor: selected ? colors.primary + '20' : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setGender((prev) => (prev === opt.value ? null : opt.value))}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.genderPillText,
                        { color: selected ? colors.primary : colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Kaydet ve Başla</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    marginBottom: Spacing.one,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: Spacing.two,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  avatarPlaceholderText: {
    fontSize: 32,
  },
  avatarHelpText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.bodyMedium,
  },
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.bodyMedium,
    marginBottom: Spacing.one,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
  genderRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  genderPill: {
    flex: 1,
    height: 48,
    borderRadius: Spacing.two,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  genderPillText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.bodyMedium,
  },
  saveButton: {
    width: '100%',
    height: 48,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Fonts.bodyMedium,
  },
});
