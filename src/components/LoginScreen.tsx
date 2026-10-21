import { Brand } from './Brand';
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, Spacing } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useColorScheme } from "../hooks/use-color-scheme";
import { getLoginThrottleState } from "../utils/security";

// Ülke ve Dil Seçenekleri
const countries = [
  "Türkiye",
  "Azerbaycan",
  "Almanya",
  "İngiltere",
  "Fransa",
  "İtalya",
  "İspanya",
  "Amerika Birleşik Devletleri",
  "Kanada",
  "Rusya",
];

const languages = [
  "Türkçe",
  "Azerbaycan dili",
  "İngilizce",
  "Almanca",
  "Fransızca",
  "İtalyanca",
  "İspanyolca",
  "Rusça",
];

// Reusable Dropdown Component styled matching the pill layout
function DropdownSelect({
  label,
  value,
  options,
  placeholder,
  onSelect,
  icon,
  colors,
  scheme,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onSelect: (val: string) => void;
  icon: keyof typeof Ionicons.glyphMap;
  colors: any;
  scheme: string;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TouchableOpacity
        style={[
          styles.pillInput,
          {
            backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
            borderColor: modalVisible
              ? colors.primary
              : scheme === "dark"
                ? "#25292E"
                : "#E2E8F0",
            borderWidth: 1.5,
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={icon}
          size={18}
          color={colors.textSecondary}
          style={{ marginRight: 10 }}
        />
        <Text
          style={[
            styles.dropdownText,
            { color: value ? colors.text : colors.textSecondary + "90" },
          ]}
        >
          {value || placeholder}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={colors.textSecondary}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {label} Seçin
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {options.map((option, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionItem,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor:
                        value === option
                          ? colors.primary + "15"
                          : "transparent",
                    },
                  ]}
                  onPress={() => {
                    onSelect(option);
                    setModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: value === option ? colors.primary : colors.text,
                        fontWeight: value === option ? "bold" : "normal",
                      },
                    ]}
                  >
                    {option}
                  </Text>
                  {value === option && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function LoginScreen({ onClose }: { onClose?: () => void }) {
  const {
    signInWithUsernameAndPin,
    signInWithEmailOrUsername,
    signUpWithOnboarding,
    signInWithGoogle,
    setShowCongratsModal,
  } = useAuth();

  // View States
  const [viewState, setViewState] = useState<"landing" | "login" | "register">(
    "landing",
  );

  // Login States
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [throttleMessage, setThrottleMessage] = useState<string | null>(null);

  // Registration / Onboarding States
  const [step, setStep] = useState(1);
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regBirthday, setRegBirthday] = useState(""); // GG/AA/YYYY
  const [regGender, setRegGender] = useState<"male" | "female" | null>(null);
  const [regCountry, setRegCountry] = useState("");
  const [regLanguage, setRegLanguage] = useState("");
  const [regHobbies, setRegHobbies] = useState<string[]>([]);

  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const availableHobbies = [
    { label: "Oyun", icon: "game-controller-outline" },
    { label: "Kitap Okumak", icon: "book-outline" },
    { label: "Seyahat", icon: "airplane-outline" },
    { label: "Müzik", icon: "musical-notes-outline" },
    { label: "Yemek Pişirmek", icon: "restaurant-outline" },
    { label: "Spor", icon: "football-outline" },
    { label: "Sinema", icon: "film-outline" },
    { label: "Fotoğrafçılık", icon: "camera-outline" },
    { label: "Resim/Sanat", icon: "color-palette-outline" },
    { label: "Kodlama/Teknoloji", icon: "code-slash-outline" },
    { label: "Podcast", icon: "headset-outline" },
    { label: "Hayvanlar", icon: "paw-outline" },
  ] as const;

  // Yaş Hesaplama Fonksiyonu (GG/AA/YYYY)
  const calculateAge = (birthDateString: string) => {
    const parts = birthDateString.split("/");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // Basit mantıksal kontrol
    if (
      day < 1 ||
      day > 31 ||
      month < 0 ||
      month > 11 ||
      year < 1900 ||
      year > new Date().getFullYear()
    ) {
      return null;
    }

    const birthDate = new Date(year, month, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Doğum Günü Maskeleme Fonksiyonu
  const handleBirthdayChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    let formatted = "";

    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 2);
      if (cleaned.length > 2) {
        formatted += "/" + cleaned.substring(2, 4);
        if (cleaned.length > 4) {
          formatted += "/" + cleaned.substring(4, 8);
        }
      }
    }
    setRegBirthday(formatted);
  };

  const handleLogin = async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      Alert.alert("Eksik Bilgi", "Lütfen bir takma ad veya e-posta girin.");
      return;
    }

    if (!pin) {
      Alert.alert("Eksik Bilgi", "Lütfen şifrenizi veya PIN kodunuzu girin.");
      return;
    }

    const throttle = await getLoginThrottleState();
    if (throttle.isLocked) {
      const mins = Math.ceil(throttle.lockoutRemainingMs / 60000);
      setThrottleMessage(
        `Çok fazla başarısız deneme. ${mins} dakika sonra tekrar deneyin.`,
      );
      return;
    }
    if (throttle.requiredDelayMs > 0) {
      const secs = Math.ceil(throttle.requiredDelayMs / 1000);
      setThrottleMessage(`Lütfen ${secs} saniye bekleyip tekrar deneyin.`);
      return;
    }
    setThrottleMessage(null);

    setLoading(true);

    if (/^\d{6}$/.test(pin) && !cleanUsername.includes("@")) {
      const { error } = await signInWithUsernameAndPin(cleanUsername, pin);
      if (!error) {
        setLoading(false);
        if (onClose) onClose();
        return;
      }
    }

    const { error } = await signInWithEmailOrUsername(cleanUsername, pin);
    setLoading(false);

    if (error) {
      Alert.alert("Giriş Başarısız", error.message || "Bir hata oluştu.");
    } else {
      if (onClose) onClose();
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!regEmail.trim() || !/\S+@\S+\.\S+/.test(regEmail)) {
        Alert.alert(
          "Geçersiz E-posta",
          "Lütfen geçerli bir e-posta adresi girin.",
        );
        return;
      }
      if (regPassword.length < 6) {
        Alert.alert("Geçersiz Şifre", "Şifre en az 6 karakter olmalıdır.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!regUsername.trim()) {
        Alert.alert("Eksik Bilgi", "Lütfen bir kullanıcı adı girin.");
        return;
      }
      if (regUsername.trim().length < 3) {
        Alert.alert(
          "Geçersiz Kullanıcı Adı",
          "Kullanıcı adı en az 3 karakter olmalıdır.",
        );
        return;
      }

      const calculatedAge = calculateAge(regBirthday);
      if (calculatedAge === null || calculatedAge < 0 || calculatedAge > 120) {
        Alert.alert(
          "Geçersiz Tarih",
          "Lütfen geçerli bir doğum tarihi girin (GG/AA/YYYY).",
        );
        return;
      }
      if (calculatedAge < 13) {
        Alert.alert(
          "Yaş Sınırı",
          "Uygulamayı kullanabilmek için en az 13 yaşında olmalısınız.",
        );
        return;
      }

      if (!regGender) {
        Alert.alert("Eksik Bilgi", "Lütfen cinsiyetinizi seçin.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!regCountry) {
        Alert.alert("Eksik Bilgi", "Lütfen ülkenizi seçin.");
        return;
      }
      if (!regLanguage) {
        Alert.alert("Eksik Bilgi", "Lütfen dilinizi seçin.");
        return;
      }
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      setViewState("landing");
    }
  };

  const handleRegister = async () => {
    if (regHobbies.length === 0) {
      Alert.alert("Eksik Bilgi", "Lütfen en az 1 hobi veya ilgi alanı seçin.");
      return;
    }

    setLoading(true);
    const calculatedAge = calculateAge(regBirthday);

    const { error, confirmationRequired } = await signUpWithOnboarding({
      username: regUsername,
      email: regEmail,
      passwordSecret: regPassword,
      country: regCountry,
      language: regLanguage,
      gender: regGender,
      hobbies: regHobbies,
      age: calculatedAge,
    });
    setLoading(false);

    if (error) {
      Alert.alert(
        "Kayıt Başarısız",
        error.message || "Kayıt işlemi sırasında bir hata oluştu.",
      );
    } else if (confirmationRequired) {
      Alert.alert('E-postanızı doğrulayın', 'Gelen kutunuza gönderilen bağlantıyı açın, ardından e-posta ve şifrenizle giriş yapın. Spam klasörünü de kontrol edin.');
      setViewState('login');
    } else {
      setShowCongratsModal(true);
      if (onClose) onClose();
    }
  };

  const handleSocialLogin = async (platform: string) => {
    if (platform === "Google") {
      setLoading(true);
      try {
        const { error } = await signInWithGoogle();
        if (error) {
          Alert.alert(
            "Giriş Hatası",
            error.message || "Google ile giriş yapılırken bir sorun oluştu."
          );
        } else if (onClose) {
          onClose();
        }
      } catch (err: any) {
        Alert.alert(
          "Giriş Hatası",
          err?.message || "Google ile giriş başlatılamadı."
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    Alert.alert(
      "Giriş Yöntemi",
      `${platform} girişi şu anda bakım aşamasındadır. Lütfen 'Doğrudan giriş yap' butonunu kullanarak devam edin.`,
    );
  };

  const showHelpCenter = () => {
    Alert.alert(
      "Yardım Merkezi",
      "Giriş yapmak veya yeni bir hesap oluşturmak ile ilgili bir sorun mu yaşıyorsunuz? Lütfen support@randomchat.app adresi üzerinden bizimle iletişime geçin.",
    );
  };

  const handleOpenDoc = (title: string) => {
    Alert.alert(
      title,
      "Bu belgeyi okumak ve onaylamak için uygulamamızı kullanmaya devam edebilirsiniz. Detaylı kullanım sözleşmelerimize web sitemiz üzerinden de ulaşabilirsiniz.",
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Top Header - Sadece landing modunda resim 1'deki "Yardım merkezi" ve info butonu bulunur */}
        {viewState === "landing" && (
          <View style={styles.topHeader}>
            <TouchableOpacity
              style={styles.helpButton}
              onPress={showHelpCenter}
              activeOpacity={0.7}
            >
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Yardım merkezi
              </Text>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Modal Close Button (Logged in users modal case) */}
        {onClose && viewState !== "landing" && (
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
        )}

        {/* Back Button for Login/Register states */}
        {viewState !== "landing" && (
          <TouchableOpacity
            style={styles.backButtonTop}
            onPress={() => {
              if (viewState === "login") {
                setViewState("landing");
              } else {
                handlePrevStep();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[styles.loadingText, { color: colors.textSecondary }]}
              >
                {viewState === "register"
                  ? "Hesabınız Oluşturuluyor..."
                  : "Oturum Açılıyor..."}
              </Text>
            </View>
          ) : (
            <View style={styles.content}>
              {/* --- 1. LANDING SCREEN (IMAGE 1 STYLE) --- */}
              {viewState === "landing" && (
                <View style={styles.landingWrapper}>
                  <View style={{ alignSelf: 'flex-start', marginBottom: 32 }}><Brand /></View>
                  <View style={{ gap: 16, marginBottom: 40 }}>
                    <Text style={{ color: colors.text, fontFamily: Fonts.heading, fontSize: 38, letterSpacing: -1.2, lineHeight: 45 }}>İyi bir sohbet,
bir merhaba ile.</Text>
                    <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 16, lineHeight: 25 }}>Yeni insanlarla tanış. Hikâyeni paylaş.
Sohbetin nereye gideceğini birlikte keşfet.</Text>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionSection}>
                    {/* Google Button */}
                    <TouchableOpacity
                      style={[
                        styles.socialButton,
                        {
                          backgroundColor:
                            scheme === "dark" ? "#172237" : "#FFFFFF",
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => handleSocialLogin("Google")}
                      activeOpacity={0.85}
                    >
                      <FontAwesome
                        name="google"
                        size={18}
                        color="#EA4335"
                        style={styles.socialIconLeft}
                      />
                      <Text
                        style={[
                          styles.socialButtonText,
                          { color: colors.text },
                        ]}
                      >
                        Google ile giriş
                      </Text>
                    </TouchableOpacity>

                    {/* Direct Login Button (Black) */}
                    <TouchableOpacity
                      style={[
                        styles.directLoginButton,
                        { backgroundColor: "#000000" },
                      ]}
                      onPress={() => setViewState("login")}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.directLoginButtonText}>
                        Doğrudan giriş yap
                      </Text>
                    </TouchableOpacity>

                    {/* Separator */}
                    <View style={styles.separatorContainer}>
                      <View
                        style={[
                          styles.separatorLine,
                          { backgroundColor: colors.border },
                        ]}
                      />
                      <Text
                        style={[
                          styles.separatorText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Veya
                      </Text>
                      <View
                        style={[
                          styles.separatorLine,
                          { backgroundColor: colors.border },
                        ]}
                      />
                    </View>

                    {/* Kayıt Ol Button */}
                    <TouchableOpacity
                      style={[
                        styles.socialButton,
                        {
                          backgroundColor: "transparent",
                          borderWidth: 1.5,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        setViewState("register");
                        setStep(1);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.socialButtonText,
                          { color: colors.primary },
                        ]}
                      >
                        Kayıt ol
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Disclaimer Footer Text */}
                  <View style={styles.disclaimerContainer}>
                    <Text
                      style={[
                        styles.disclaimerText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Kaydolarak,{" "}
                      <Text
                        style={styles.disclaimerLink}
                        onPress={() => handleOpenDoc("Kullanım Koşulları")}
                      >
                        Kullanım Koşullarını
                      </Text>
                      ,{" "}
                      <Text
                        style={styles.disclaimerLink}
                        onPress={() => handleOpenDoc("Gizlilik İlkesi")}
                      >
                        Gizlilik İlkesi
                      </Text>{" "}
                      ve{" "}
                      <Text
                        style={styles.disclaimerLink}
                        onPress={() => handleOpenDoc("Cookies Politikası")}
                      >
                        Cookies Politikası
                      </Text>{" "}
                      okuduğunuzu ve kabul ettiğinizi belirtmiş olursunuz.
                    </Text>
                  </View>
                </View>
              )}

              {/* --- 2. LOGIN FORM --- */}
              {viewState === "login" && (
                <View style={styles.formWrapper}>
                  <Text style={[styles.formTitle, { color: colors.text }]}>
                    Giriş Yap
                  </Text>
                  <Text
                    style={[
                      styles.formSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Devam etmek için giriş bilgilerinizi girin.
                  </Text>

                  {throttleMessage && (
                    <View
                      style={[
                        styles.throttleWarning,
                        {
                          backgroundColor: "#EF444415",
                          borderColor: "#EF444430",
                        },
                      ]}
                    >
                      <Ionicons
                        name="warning-outline"
                        size={16}
                        color="#EF4444"
                      />
                      <Text
                        style={{
                          color: "#EF4444",
                          fontSize: 12,
                          flex: 1,
                          fontFamily: Fonts.body,
                        }}
                      >
                        {throttleMessage}
                      </Text>
                    </View>
                  )}

                  <View style={styles.inputContainer}>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Takma Ad veya E-posta
                    </Text>
                    <TextInput
                      style={[
                        styles.pillInput,
                        {
                          color: colors.text,
                          backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                          borderColor: focusedInput === "login_username"
                            ? colors.primary
                            : scheme === "dark"
                              ? "#25292E"
                              : "#E2E8F0",
                          borderWidth: 1.5,
                        },
                      ]}
                      placeholder="sohbet_sever veya e-posta"
                      placeholderTextColor={colors.textSecondary + "A0"}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={50}
                      onFocus={() => setFocusedInput("login_username")}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Şifre veya 6 Haneli PIN Kodu
                    </Text>
                    <TextInput
                      style={[
                        styles.pillInput,
                        {
                          color: colors.text,
                          backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                          borderColor: focusedInput === "login_password"
                            ? colors.primary
                            : scheme === "dark"
                              ? "#25292E"
                              : "#E2E8F0",
                          borderWidth: 1.5,
                        },
                      ]}
                      placeholder="******"
                      placeholderTextColor={colors.textSecondary + "A0"}
                      value={pin}
                      onChangeText={setPin}
                      secureTextEntry={true}
                      maxLength={32}
                      onFocus={() => setFocusedInput("login_password")}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      {
                        backgroundColor: colors.action,
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: scheme === "dark" ? 0.35 : 0.2,
                        shadowRadius: 6,
                        elevation: 3,
                      },
                    ]}
                    onPress={handleLogin}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Giriş Yap</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.toggleLink}
                    onPress={() => {
                      setViewState("register");
                      setStep(1);
                    }}
                  >
                    <Text
                      style={[styles.toggleLinkText, { color: colors.primary }]}
                    >
                      Hesabınız yok mu?{" "}
                      <Text style={{ fontWeight: "bold" }}>Kayıt Ol</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* --- 3. REGISTRATION ONBOARDING FLOW --- */}
              {viewState === "register" && (
                <View style={styles.formWrapper}>
                  {/* Step indicators */}
                  <View style={styles.progressContainer}>
                    {[1, 2, 3, 4].map((s) => (
                      <View key={s} style={styles.progressStepWrapper}>
                        <View
                          style={[
                            styles.progressCircle,
                            {
                              backgroundColor:
                                step >= s
                                  ? colors.primary
                                  : scheme === "dark"
                                    ? "#172237"
                                    : "#FFFFFF",
                              borderColor:
                                step >= s
                                  ? colors.primary
                                  : scheme === "dark"
                                    ? "#25292E"
                                    : "#E2E8F0",
                            },
                          ]}
                        >
                          {step > s ? (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color="#FFFFFF"
                            />
                          ) : (
                            <Text
                              style={[
                                styles.progressCircleText,
                                {
                                  color:
                                    step === s
                                      ? "#FFFFFF"
                                      : colors.textSecondary,
                                },
                              ]}
                            >
                              {s}
                            </Text>
                          )}
                        </View>
                        {s < 4 && (
                          <View
                            style={[
                              styles.progressLine,
                              {
                                backgroundColor:
                                  step > s
                                    ? colors.primary
                                    : scheme === "dark"
                                      ? "#25292E"
                                      : "#E2E8F0",
                              },
                            ]}
                          />
                        )}
                      </View>
                    ))}
                  </View>

                  {/* STEP 1: Account credentials */}
                  {step === 1 && (
                    <View style={{ gap: Spacing.three, width: "100%" }}>
                      <Text
                        style={[
                          styles.formTitle,
                          { color: colors.text, textAlign: "center" },
                        ]}
                      >
                        Hesap Oluşturun
                      </Text>
                      <Text
                        style={[
                          styles.formSubtitle,
                          { color: colors.textSecondary, textAlign: "center" },
                        ]}
                      >
                        Kayıt olmak için e-posta adresi ve şifre belirleyin.
                      </Text>

                      <View style={styles.inputContainer}>
                        <Text
                          style={[
                            styles.inputLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          E-posta
                        </Text>
                        <TextInput
                          style={[
                            styles.pillInput,
                            {
                              color: colors.text,
                              backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                              borderColor: focusedInput === "reg_email"
                                ? colors.primary
                                : scheme === "dark"
                                  ? "#25292E"
                                  : "#E2E8F0",
                              borderWidth: 1.5,
                            },
                          ]}
                          placeholder="user@domain.com"
                          placeholderTextColor={colors.textSecondary + "A0"}
                          value={regEmail}
                          onChangeText={setRegEmail}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          onFocus={() => setFocusedInput("reg_email")}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text
                          style={[
                            styles.inputLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Şifre
                        </Text>
                        <TextInput
                          style={[
                            styles.pillInput,
                            {
                              color: colors.text,
                              backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                              borderColor: focusedInput === "reg_password"
                                ? colors.primary
                                : scheme === "dark"
                                  ? "#25292E"
                                  : "#E2E8F0",
                              borderWidth: 1.5,
                            },
                          ]}
                          placeholder="En az 6 karakter"
                          placeholderTextColor={colors.textSecondary + "A0"}
                          value={regPassword}
                          onChangeText={setRegPassword}
                          secureTextEntry={true}
                          maxLength={32}
                          onFocus={() => setFocusedInput("reg_password")}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          {
                            backgroundColor: colors.action,
                            shadowColor: colors.primary,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: scheme === "dark" ? 0.35 : 0.2,
                            shadowRadius: 6,
                            elevation: 3,
                          },
                        ]}
                        onPress={handleNextStep}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.primaryButtonText}>İleri</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* STEP 2: Personal details (IMAGE 2 STYLE EXACTLY) */}
                  {step === 2 && (
                    <View style={{ gap: Spacing.three, width: "100%" }}>
                      <Text
                        style={[
                          styles.referenceTitle,
                          { color: scheme === "dark" ? "#FFFFFF" : "#1A253C" },
                        ]}
                      >
                        Bilgileri doldurun
                      </Text>
                      <Text
                        style={[
                          styles.referenceSubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Kayıt bilgilerinizi doğru girin. E-posta adresinizi
                        doğrulamanız gerekecek.
                      </Text>

                      {/* Kullanıcı Adı */}
                      <View style={[styles.inputContainer, { marginTop: 15 }]}>
                        <Text
                          style={[
                            styles.referenceLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Kullanıcı adı
                        </Text>
                        <TextInput
                          style={[
                            styles.referencePillInput,
                            {
                              color: colors.text,
                              backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                              borderColor: focusedInput === "reg_username"
                                ? colors.primary
                                : scheme === "dark"
                                  ? "#25292E"
                                  : "#E2E8F0",
                              borderWidth: 1.5,
                              textAlign: "center",
                            },
                          ]}
                          placeholder="Kullanıcı Adı"
                          placeholderTextColor={colors.textSecondary + "A0"}
                          value={regUsername}
                          onChangeText={setRegUsername}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={20}
                          onFocus={() => setFocusedInput("reg_username")}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>

                      {/* Doğum Tarihi */}
                      <View style={styles.inputContainer}>
                        <Text
                          style={[
                            styles.referenceLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Doğum tarihin
                        </Text>
                        <TextInput
                          style={[
                            styles.referencePillInput,
                            {
                              color: colors.text,
                              backgroundColor: scheme === "dark" ? "#172237" : "#FFFFFF",
                              borderColor: focusedInput === "reg_birthday"
                                ? colors.primary
                                : scheme === "dark"
                                  ? "#25292E"
                                  : "#E2E8F0",
                              borderWidth: 1.5,
                              textAlign: "center",
                              letterSpacing: 2,
                              fontFamily: Fonts.mono,
                            },
                          ]}
                          placeholder="D D / M M / Y Y Y Y"
                          placeholderTextColor={colors.textSecondary + "A0"}
                          value={regBirthday}
                          onChangeText={handleBirthdayChange}
                          keyboardType="number-pad"
                          maxLength={10}
                          onFocus={() => setFocusedInput("reg_birthday")}
                          onBlur={() => setFocusedInput(null)}
                        />
                        <Text
                          style={[
                            styles.referenceHelperText,
                            { color: colors.textSecondary + "B0" },
                          ]}
                        >
                          * Gün / Ay / Yıl
                        </Text>
                      </View>

                      {/* Cinsiyet */}
                      <View style={[styles.inputContainer, { marginTop: 10 }]}>
                        <View style={styles.genderRow}>
                          {/* Erkek */}
                          <TouchableOpacity
                            style={[
                              styles.genderPill,
                              {
                                backgroundColor:
                                  regGender === "male"
                                    ? (scheme === "dark" ? colors.primary + "25" : colors.primary + "12")
                                    : (scheme === "dark" ? "#172237" : "#FFFFFF"),
                                borderColor:
                                  regGender === "male"
                                    ? colors.primary
                                    : (scheme === "dark" ? "#25292E" : "#E2E8F0"),
                                borderWidth: 1.5,
                              },
                            ]}
                            onPress={() => setRegGender("male")}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name="male"
                              size={20}
                              color={
                                regGender === "male"
                                  ? colors.primary
                                  : colors.textSecondary
                              }
                            />
                            <Text
                              style={[
                                styles.genderText,
                                {
                                  color:
                                    regGender === "male"
                                      ? colors.primary
                                      : colors.text,
                                  fontFamily: Fonts.bodyMedium,
                                },
                              ]}
                            >
                              Erkek
                            </Text>
                          </TouchableOpacity>

                          {/* Kadın */}
                          <TouchableOpacity
                            style={[
                              styles.genderPill,
                              {
                                backgroundColor:
                                  regGender === "female"
                                    ? (scheme === "dark" ? colors.primary + "25" : colors.primary + "12")
                                    : (scheme === "dark" ? "#172237" : "#FFFFFF"),
                                borderColor:
                                  regGender === "female"
                                    ? colors.primary
                                    : (scheme === "dark" ? "#25292E" : "#E2E8F0"),
                                borderWidth: 1.5,
                              },
                            ]}
                            onPress={() => setRegGender("female")}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name="female"
                              size={20}
                              color={
                                regGender === "female"
                                  ? colors.primary
                                  : colors.textSecondary
                              }
                            />
                            <Text
                              style={[
                                styles.genderText,
                                {
                                  color:
                                    regGender === "female"
                                      ? colors.primary
                                      : colors.text,
                                  fontFamily: Fonts.bodyMedium,
                                },
                              ]}
                            >
                              Kadın
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Save Button (faded/disabled if empty, matches screenshot) */}
                      {(() => {
                        const isFormValid =
                          regUsername.trim().length >= 3 &&
                          regBirthday.length === 10 &&
                          regGender !== null;
                        return (
                          <TouchableOpacity
                            style={[
                              styles.referenceSaveButton,
                              {
                                backgroundColor: isFormValid
                                  ? colors.primary
                                  : scheme === "dark"
                                    ? "#1B2230"
                                    : "#E2E8F0",
                                shadowColor: isFormValid ? colors.primary : "transparent",
                                shadowOffset: isFormValid ? { width: 0, height: 4 } : { width: 0, height: 0 },
                                shadowOpacity: isFormValid ? (scheme === "dark" ? 0.35 : 0.2) : 0,
                                shadowRadius: isFormValid ? 6 : 0,
                                elevation: isFormValid ? 3 : 0,
                              },
                            ]}
                            onPress={handleNextStep}
                            disabled={!isFormValid}
                            activeOpacity={0.85}
                          >
                            <Text
                              style={[
                                styles.referenceSaveButtonText,
                                {
                                  color: isFormValid
                                    ? "#FFFFFF"
                                    : scheme === "dark"
                                      ? "#5A6E85"
                                      : "#94A3B8",
                                },
                              ]}
                            >
                              Kaydet
                            </Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  )}

                  {/* STEP 3: Location and Language */}
                  {step === 3 && (
                    <View style={{ gap: Spacing.three, width: "100%" }}>
                      <Text
                        style={[
                          styles.formTitle,
                          { color: colors.text, textAlign: "center" },
                        ]}
                      >
                        Profilini Özelleştir{" "}
                        <Ionicons name="sparkles" size={18} color="#FBBF24" />
                      </Text>
                      <Text
                        style={[
                          styles.formSubtitle,
                          { color: colors.textSecondary, textAlign: "center" },
                        ]}
                      >
                        Lütfen konum ve dil tercihinizi belirtiniz.
                      </Text>

                      <DropdownSelect
                        label="Ülke"
                        value={regCountry}
                        options={countries}
                        placeholder="Ülke seçiniz"
                        onSelect={setRegCountry}
                        icon="earth-outline"
                        colors={colors}
                        scheme={scheme}
                      />

                      <DropdownSelect
                        label="Konuşulan Dil"
                        value={regLanguage}
                        options={languages}
                        placeholder="Dil seçiniz"
                        onSelect={setRegLanguage}
                        icon="language-outline"
                        colors={colors}
                        scheme={scheme}
                      />

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          {
                            backgroundColor: colors.action,
                            shadowColor: colors.primary,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: scheme === "dark" ? 0.35 : 0.2,
                            shadowRadius: 6,
                            elevation: 3,
                          },
                        ]}
                        onPress={handleNextStep}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.primaryButtonText}>İleri</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* STEP 4: Hobbies Selection */}
                  {step === 4 && (
                    <View style={{ gap: Spacing.three, width: "100%" }}>
                      <Text
                        style={[
                          styles.formTitle,
                          { color: colors.text, textAlign: "center" },
                        ]}
                      >
                        İlgi Alanlarınızı Seçin{" "}
                        <Ionicons name="color-palette" size={18} color={colors.primary} />
                      </Text>
                      <Text
                        style={[
                          styles.formSubtitle,
                          { color: colors.textSecondary, textAlign: "center" },
                        ]}
                      >
                        Ortak ilgi alanlarına sahip insanlarla eşleşmenizi
                        kolaylaştıracaktır (En az 1 adet seçiniz).
                      </Text>

                      <View style={styles.hobbiesContainer}>
                        {availableHobbies.map((hobby) => {
                          const isSelected = regHobbies.includes(hobby.label);
                          return (
                            <TouchableOpacity
                              key={hobby.label}
                              style={[
                                styles.hobbyPill,
                                {
                                  backgroundColor: isSelected
                                    ? (scheme === "dark" ? colors.primary + "25" : colors.primary + "12")
                                    : (scheme === "dark" ? "#172237" : "#FFFFFF"),
                                  borderColor: isSelected
                                    ? colors.primary
                                    : (scheme === "dark" ? "#25292E" : "#E2E8F0"),
                                  borderWidth: 1.5,
                                },
                              ]}
                              onPress={() => {
                                if (isSelected) {
                                  setRegHobbies(
                                    regHobbies.filter((h) => h !== hobby.label),
                                  );
                                } else {
                                  setRegHobbies([...regHobbies, hobby.label]);
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={hobby.icon}
                                size={15}
                                color={
                                  isSelected
                                    ? colors.primary
                                    : colors.textSecondary
                                }
                                style={{ marginRight: 6 }}
                              />
                              <Text
                                style={[
                                  styles.hobbyPillText,
                                  {
                                    color: isSelected
                                      ? colors.primary
                                      : colors.text,
                                  },
                                ]}
                              >
                                {hobby.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          {
                            backgroundColor: colors.action,
                            shadowColor: colors.primary,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: scheme === "dark" ? 0.35 : 0.2,
                            shadowRadius: 6,
                            elevation: 3,
                          },
                        ]}
                        onPress={handleRegister}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.primaryButtonText}>
                          Kaydı Tamamla
                        </Text>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color="#FFFFFF"
                          style={{ marginLeft: 5 }}
                        />
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.toggleLink}
                    onPress={() => {
                      setViewState("login");
                    }}
                  >
                    <Text
                      style={[styles.toggleLinkText, { color: colors.primary }]}
                    >
                      Zaten hesabınız var mı?{" "}
                      <Text style={{ fontWeight: "bold" }}>Giriş Yap</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    height: 48,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  helpText: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 16,
    zIndex: 99,
    padding: 8,
    borderRadius: 22,
  },
  backButtonTop: {
    position: "absolute",
    top: 10,
    left: 16,
    zIndex: 99,
    padding: 8,
    borderRadius: 22,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 400,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
  },

  // --- Landing Screen specific styles ---
  landingWrapper: {
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 520,
    paddingVertical: 10,
  },
  mascotCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    overflow: "hidden",
  },
  mascotInner: {
    width: 100,
    height: 100,
    position: "relative",
  },
  mascotBubble: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  mascotBubbleTail: {
    position: "absolute",
    bottom: -6,
    left: 14,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
  mascotHand: {
    position: "absolute",
    bottom: 6,
    left: 14,
    transform: [{ rotate: "-15deg" }],
  },
  brandSection: {
    alignItems: "center",
    marginTop: 25,
    marginBottom: 50,
  },
  brandName: {
    fontSize: 30,
    fontWeight: "bold",
    fontFamily: Fonts.headingBlack,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
    marginTop: 2,
  },
  actionSection: {
    width: "100%",
    gap: 14,
    paddingHorizontal: 10,
  },
  socialButton: {
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  socialIconLeft: {
    position: "absolute",
    left: 24,
  },
  socialButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
  },
  directLoginButton: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  directLoginButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
  },
  separatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    gap: 12,
  },
  separatorLine: {
    height: 1,
    flex: 1,
    maxWidth: 60,
  },
  separatorText: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  googleContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginVertical: 4,
  },
  googleCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  disclaimerContainer: {
    paddingHorizontal: 15,
    marginTop: 35,
  },
  disclaimerText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    fontFamily: Fonts.body,
  },
  disclaimerLink: {
    color: "#3F7AEC",
    textDecorationLine: "underline",
  },

  // --- Form specific styles (Login & Register) ---
  formWrapper: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    paddingTop: 30,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    textAlign: "center",
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  inputContainer: {
    width: "100%",
    gap: 6,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
    fontFamily: Fonts.bodyMedium,
  },
  pillInput: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    fontSize: 14,
    fontFamily: Fonts.body,
    flexDirection: "row",
    alignItems: "center",
  },
  primaryButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
  },
  toggleLink: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: Spacing.two,
  },
  toggleLinkText: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  throttleWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },

  // --- Reference Images style (Image 2 style) ---
  referenceTitle: {
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
    textAlign: "center",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  referenceSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 25,
  },
  referenceLabel: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
    marginLeft: 14,
    marginBottom: 2,
  },
  referencePillInput: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 20,
    fontSize: 15,
    fontFamily: Fonts.body,
  },
  referenceHelperText: {
    fontSize: 11,
    marginLeft: 16,
    marginTop: 2,
    fontFamily: Fonts.body,
  },
  genderRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginVertical: 10,
  },
  genderPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  genderSymbol: {
    fontSize: 20,
    fontWeight: "bold",
  },
  genderText: {
    fontSize: 14,
    fontWeight: "600",
  },
  referenceSaveButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 35,
    width: "100%",
  },
  referenceSaveButtonText: {
    fontWeight: "bold",
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
  },

  // Dropdown Component specific
  dropdownText: {
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 14, 26, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Fonts.heading,
  },
  modalCloseButton: {
    padding: 4,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 15,
    fontFamily: Fonts.body,
  },

  // --- Onboarding Step Progress/Indicator bar ---
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 25,
    width: "100%",
  },
  progressStepWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  progressCircleText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  progressLine: {
    width: 36,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 4,
  },

  // STEP 4 Hobbies step specific
  hobbiesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginVertical: 10,
  },
  hobbyPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  hobbyPillText: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: Fonts.bodyMedium,
  },
});
