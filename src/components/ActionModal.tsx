import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  createRef,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
  ReactNode,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ──────────────────────────────────────────────────────────────

export type ActionModalType = "info" | "success" | "error" | "warning";

export interface ActionModalButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
}

export interface ActionModalOptions {
  title: string | ReactNode;
  message?: string;
  type?: ActionModalType;
  buttons?: ActionModalButton[];
}

export interface ActionModalPromptOptions {
  title: string | ReactNode;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void | Promise<void>;
}

interface ActionModalRef {
  show: (options: ActionModalOptions) => void;
  prompt: (options: ActionModalPromptOptions) => void;
}

// ── Icon & Color Helpers ───────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ActionModalType,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  info: { icon: "information-circle", color: "#3B82F6" },
  success: { icon: "checkmark-circle", color: "#10B981" },
  error: { icon: "close-circle", color: "#EF4444" },
  warning: { icon: "warning", color: "#F59E0B" },
};

// ── Internal Ref ───────────────────────────────────────────────────────

const modalRef = createRef<ActionModalRef>();

// ── Public Imperative API ──────────────────────────────────────────────

export const ActionModal = {
  /**
   * Show an alert-style modal.
   *
   * Usage:
   * ```ts
   * ActionModal.show({ title: "Başarılı", message: "İşlem tamam.", type: "success" });
   * ActionModal.show({
   *   title: "Sil?",
   *   message: "Silmek istediğinize emin misiniz?",
   *   type: "warning",
   *   buttons: [
   *     { text: "İptal", style: "cancel" },
   *     { text: "Sil", style: "destructive", onPress: handleDelete },
   *   ],
   * });
   * ```
   */
  show(options: ActionModalOptions) {
    modalRef.current?.show(options);
  },

  /**
   * Show a prompt modal with a text input.
   *
   * Usage:
   * ```ts
   * ActionModal.prompt({
   *   title: "Şikayet Et",
   *   message: "Lütfen şikayet nedeninizi yazın:",
   *   placeholder: "Nedeniniz...",
   *   onSubmit: async (reason) => { ... },
   * });
   * ```
   */
  prompt(options: ActionModalPromptOptions) {
    modalRef.current?.prompt(options);
  },
};

// ── Modal Provider Component ───────────────────────────────────────────

export const ActionModalProvider = forwardRef<ActionModalRef>(
  function ActionModalProvider(_props, ref) {
    const scheme = useColorScheme();
    const colors = Colors[scheme === "dark" ? "dark" : "light"];
    const isDark = scheme === "dark";
    const insets = useSafeAreaInsets();

    // Alert state
    const [visible, setVisible] = useState(false);
    const [options, setOptions] = useState<ActionModalOptions | null>(null);

    // Prompt state
    const [promptVisible, setPromptVisible] = useState(false);
    const [promptOptions, setPromptOptions] =
      useState<ActionModalPromptOptions | null>(null);
    const [promptValue, setPromptValue] = useState("");

    // Animation
    const [translateYAnim] = useState(() => new Animated.Value(500));
    const [opacityAnim] = useState(() => new Animated.Value(0));

    const animateIn = useCallback(() => {
      translateYAnim.setValue(500);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(translateYAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, [translateYAnim, opacityAnim]);

    const animateOut = useCallback(
      (onDone?: () => void) => {
        Animated.parallel([
          Animated.timing(translateYAnim, {
            toValue: 500,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start(() => onDone?.());
      },
      [translateYAnim, opacityAnim],
    );

    // Imperative handle exposed to ref
    useImperativeHandle(ref, () => ({
      show(opts: ActionModalOptions) {
        setOptions(opts);
        setVisible(true);
        setTimeout(animateIn, 50);
      },
      prompt(opts: ActionModalPromptOptions) {
        setPromptOptions(opts);
        setPromptValue(opts.defaultValue ?? "");
        setPromptVisible(true);
        setTimeout(animateIn, 50);
      },
    }));

    // ── Alert Dismiss ────────────────────────────────────────────────

    const dismissAlert = useCallback(
      (onPress?: () => void | Promise<void>) => {
        animateOut(() => {
          setVisible(false);
          setOptions(null);
          onPress?.();
        });
      },
      [animateOut],
    );

    // ── Prompt Dismiss ───────────────────────────────────────────────

    const dismissPrompt = useCallback(
      (submit: boolean) => {
        animateOut(() => {
          setPromptVisible(false);
          if (submit && promptOptions?.onSubmit) {
            promptOptions.onSubmit(promptValue);
          }
          setPromptOptions(null);
          setPromptValue("");
        });
      },
      [animateOut, promptOptions, promptValue],
    );

    // ── Derived Values ───────────────────────────────────────────────

    const type = options?.type ?? "info";
    const typeConfig = TYPE_CONFIG[type];

    // If no buttons provided, show a single "Tamam" button
    const buttons: ActionModalButton[] =
      options?.buttons && options.buttons.length > 0
        ? options.buttons
        : [{ text: "Tamam", style: "default" }];

    // Separate cancel from action buttons
    const cancelButton = buttons.find((b) => b.style === "cancel");
    const actionButtons = buttons.filter((b) => b.style !== "cancel");

    // ── Render ───────────────────────────────────────────────────────

    return (
      <>
        {/* ───────── Alert Modal ───────── */}
        <Modal
          visible={visible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => dismissAlert()}
        >
          <View style={styles.backdrop}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  opacity: opacityAnim,
                },
              ]}
              onTouchStart={() => dismissAlert()}
            />
            <Animated.View
              style={[
                styles.card,
                {
                  backgroundColor: isDark
                    ? colors.backgroundElement
                    : colors.background,
                  borderColor: colors.border,
                  transform: [{ translateY: translateYAnim }],
                  paddingBottom: Math.max(insets.bottom, 12) + Spacing.four,
                },
              ]}
            >
              {/* Drag Handle */}
              <View
                style={[
                  styles.dragHandle,
                  { backgroundColor: isDark ? "#1E293B" : "#E2E8F0" },
                ]}
              />

              {/* Icon */}
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: typeConfig.color + "18" },
                ]}
              >
                <Ionicons
                  name={typeConfig.icon}
                  size={32}
                  color={typeConfig.color}
                />
              </View>

              {/* Title */}
              {typeof options?.title === "string" ? (
                <Text
                  style={[styles.title, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {options.title}
                </Text>
              ) : (
                options?.title
              )}

              {/* Message */}
              {options?.message ? (
                <Text style={[styles.message, { color: colors.textSecondary }]}>
                  {options.message}
                </Text>
              ) : null}

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                {/* Action buttons */}
                {actionButtons.map((btn, idx) => {
                  const isDestructive = btn.style === "destructive";
                  return (
                    <TouchableOpacity
                      key={`action-${idx}`}
                      style={[
                        styles.button,
                        {
                          backgroundColor: isDestructive
                            ? "#EF4444"
                            : colors.primary,
                        },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => dismissAlert(btn.onPress)}
                    >
                      <Text style={styles.buttonText}>{btn.text}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Cancel button */}
                {cancelButton ? (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.cancelButton,
                      { borderColor: colors.border },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => dismissAlert(cancelButton.onPress)}
                  >
                    <Text
                      style={[
                        styles.cancelButtonText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {cancelButton.text}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* ───────── Prompt Modal ───────── */}
        <Modal
          visible={promptVisible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => dismissPrompt(false)}
        >
          <KeyboardAvoidingView
            style={styles.backdrop}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  opacity: opacityAnim,
                },
              ]}
              onTouchStart={() => dismissPrompt(false)}
            />
            <Animated.View
              style={[
                styles.card,
                {
                  backgroundColor: isDark
                    ? colors.backgroundElement
                    : colors.background,
                  borderColor: colors.border,
                  transform: [{ translateY: translateYAnim }],
                  paddingBottom: Math.max(insets.bottom, 12) + Spacing.four,
                },
              ]}
            >
              {/* Drag Handle */}
              <View
                style={[
                  styles.dragHandle,
                  { backgroundColor: isDark ? "#1E293B" : "#E2E8F0" },
                ]}
              />

              {/* Icon */}
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={28}
                  color={colors.primary}
                />
              </View>

              {/* Title */}
              {typeof promptOptions?.title === "string" ? (
                <Text style={[styles.title, { color: colors.text }]}>
                  {promptOptions?.title}
                </Text>
              ) : (
                promptOptions?.title
              )}

              {/* Message */}
              {promptOptions?.message ? (
                <Text style={[styles.message, { color: colors.textSecondary }]}>
                  {promptOptions.message}
                </Text>
              ) : null}

              {/* Input */}
              <TextInput
                style={[
                  styles.promptInput,
                  {
                    color: colors.text,
                    backgroundColor: isDark
                      ? colors.background
                      : colors.backgroundElement,
                    borderColor: colors.border,
                  },
                ]}
                placeholder={promptOptions?.placeholder ?? "Yazın..."}
                placeholderTextColor={colors.textSecondary}
                value={promptValue}
                onChangeText={setPromptValue}
                multiline
                autoFocus
              />

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                  onPress={() => dismissPrompt(true)}
                >
                  <Text style={styles.buttonText}>Gönder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.cancelButton,
                    { borderColor: colors.border },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => dismissPrompt(false)}
                >
                  <Text
                    style={[
                      styles.cancelButtonText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    İptal
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  },
);

// ── Root-level Wrapper (placed in _layout.tsx) ─────────────────────────

export function ActionModalRoot() {
  return <ActionModalProvider ref={modalRef} />;
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 500,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === "ios" ? Spacing.five : Spacing.four,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      web: { boxShadow: "0 -4px 24px rgba(0,0,0,0.2)" },
    }),
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: Platform.OS === "web" ? "600" : undefined,
    textAlign: "center",
    marginBottom: Spacing.two,
  },
  message: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.four,
    paddingHorizontal: Spacing.two,
  },
  buttonContainer: {
    width: "100%",
    gap: Spacing.two,
  },
  button: {
    width: "100%",
    height: 48,
    borderRadius: 250,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    fontWeight: Platform.OS === "web" ? "500" : undefined,
    color: "#FFFFFF",
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    fontWeight: Platform.OS === "web" ? "500" : undefined,
  },
  promptInput: {
    width: "100%",
    minHeight: 80,
    maxHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontFamily: Fonts.body,
    fontSize: 14,
    textAlignVertical: "top",
    marginBottom: Spacing.three,
  },
});
